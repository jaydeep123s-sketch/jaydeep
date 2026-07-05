require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const archiver = require('archiver');
const multer = require('multer');
const AdmZip = require('adm-zip');

const { connectDB } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { router: authRouter, publicUser } = require('./routes/auth');
const chatsRouter = require('./routes/chats');
const paymentRouter = require('./routes/payment');
const relatedVideosRouter = require('./routes/relatedVideos');

const app = express();
const PORT = process.env.PORT || 3000;
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const TOGETHER_MODEL = process.env.TOGETHER_MODEL || 'deepseek-ai/DeepSeek-V4-Pro';
const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions';

connectDB();

app.use(cors());
app.use(compression()); // gzip everything -> faster responses over slow connections
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' })); // cache static assets -> faster loads

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, model: TOGETHER_MODEL, keyConfigured: !!TOGETHER_API_KEY });
});

// ---------- Auth, chat history and payment routes ----------
const mongoose = require('mongoose');
function requireDB(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database is not connected. Check MONGODB_URI in your .env file.' });
  }
  next();
}
app.use('/api/auth', requireDB, authRouter);
app.use('/api/chats', requireDB, chatsRouter);
app.use('/api/payment', requireDB, paymentRouter);
app.use('/api/related-videos', requireDB, relatedVideosRouter);

// ---------- Markdown -> structured blocks (for PDF/DOCX export) ----------
const LANG_EXT_SERVER = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py',
  bash: 'sh', sh: 'sh', shell: 'sh', json: 'json', html: 'html', xml: 'xml',
  css: 'css', yaml: 'yml', yml: 'yml', go: 'go', golang: 'go', java: 'java',
  c: 'c', cpp: 'cpp', sql: 'sql', markdown: 'md', md: 'md', ruby: 'rb', php: 'php', rust: 'rs',
};

function parseBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: 'code', lang, content: codeLines.join('\n') });
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.*)/.exec(line);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }
    const bulletMatch = /^\s*[-*]\s+(.*)/.exec(line);
    if (bulletMatch) {
      blocks.push({ type: 'bullet', text: bulletMatch[1] });
      i++;
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    blocks.push({ type: 'para', text: line });
    i++;
  }
  return blocks;
}

function splitBoldRuns(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith('**') && p.endsWith('**')) return { text: p.slice(2, -2), bold: true };
    return { text: p, bold: false };
  });
}

// ---------- PDF export (real formatted PDF via pdfkit) ----------
app.post('/api/export/pdf', (req, res) => {
  const { text, filename } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename || 'opsmind-response.pdf'}"`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  const blocks = parseBlocks(text);
  doc.font('Helvetica').fontSize(11);

  for (const block of blocks) {
    if (block.type === 'heading') {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(Math.max(20 - block.level * 2, 12));
      doc.text(block.text);
      doc.font('Helvetica').fontSize(11);
      doc.moveDown(0.3);
    } else if (block.type === 'code') {
      doc.moveDown(0.3);
      const startY = doc.y;
      doc.font('Courier').fontSize(9.5).fillColor('#1f2937');
      doc.text(block.content, { lineGap: 2 });
      doc.fillColor('black').font('Helvetica').fontSize(11);
      doc.moveDown(0.3);
    } else if (block.type === 'bullet') {
      doc.text(`•  ${block.text}`, { indent: 15 });
    } else {
      const runs = splitBoldRuns(block.text);
      for (let idx = 0; idx < runs.length; idx++) {
        const run = runs[idx];
        doc.font(run.bold ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(run.text, { continued: idx < runs.length - 1 });
      }
      doc.moveDown(0.2);
    }
  }
  doc.end();
});

// ---------- DOCX export (real Word doc via docx library) ----------
app.post('/api/export/docx', async (req, res) => {
  const { text, filename } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  const blocks = parseBlocks(text);
  const children = [];
  const headingLevels = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      children.push(new Paragraph({ text: block.text, heading: headingLevels[block.level] || HeadingLevel.HEADING_4 }));
    } else if (block.type === 'code') {
      for (const codeLine of block.content.split('\n')) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: codeLine || ' ', font: 'Courier New', size: 20 })],
            shading: { fill: 'F2F2F2' },
          })
        );
      }
      children.push(new Paragraph({ text: '' }));
    } else if (block.type === 'bullet') {
      children.push(new Paragraph({ text: block.text, bullet: { level: 0 } }));
    } else {
      const runs = splitBoldRuns(block.text).map((r) => new TextRun({ text: r.text, bold: r.bold }));
      children.push(new Paragraph({ children: runs }));
    }
  }

  try {
    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'opsmind-response.docx'}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- ZIP export (whole conversation: transcript + extracted code files) ----------
app.post('/api/export/zip', (req, res) => {
  const { messages, chatTitle } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

  const safeName = (chatTitle || 'opsmind-export').replace(/[^a-z0-9\-_]/gi, '_').slice(0, 60);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => res.status(500).send({ error: err.message }));
  archive.pipe(res);

  let transcript = `# ${chatTitle || 'OpsMind conversation'}\n\n`;
  let fileCounter = 1;
  for (const msg of messages) {
    transcript += `## ${msg.role === 'user' ? 'You' : 'Assistant'}\n\n${msg.content}\n\n---\n\n`;
    if (msg.role === 'assistant') {
      const blocks = parseBlocks(msg.content);
      for (const block of blocks) {
        if (block.type === 'code') {
          const ext = LANG_EXT_SERVER[(block.lang || '').toLowerCase()] || 'txt';
          archive.append(block.content, { name: `snippets/snippet-${fileCounter}.${ext}` });
          fileCounter++;
        }
      }
    }
  }
  archive.append(transcript, { name: 'transcript.md' });
  archive.finalize();
});

// ---------- File upload (any file type, including .zip archives) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB per file
});

const TEXTY_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'py', 'json', 'csv', 'tsv',
  'yml', 'yaml', 'log', 'html', 'htm', 'css', 'scss', 'xml', 'sh', 'bash', 'sql',
  'go', 'java', 'c', 'cpp', 'h', 'hpp', 'rb', 'php', 'rs', 'env', 'ini', 'conf',
  'toml', 'gradle', 'dockerfile', 'tf', 'tfvars', 'gitignore',
]);

function looksLikeText(buffer) {
  if (!buffer || buffer.length === 0) return true;
  const sample = buffer.subarray(0, 2000);
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte === 0) return false; // NUL byte -> definitely binary
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious++;
  }
  return suspicious / sample.length < 0.05;
}

const MAX_FILE_TEXT = 40 * 1024; // cap extracted text per file
const MAX_TOTAL_TEXT = 250 * 1024; // cap total extracted text per upload

function extFromName(name) {
  const parts = String(name || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

// Accepts ANY file type. Zips are unpacked and every readable text file
// inside is extracted (so the user can just drop a whole project .zip).
// Binary files (images, exe, pdf binaries, etc.) are reported as metadata
// only, since their raw bytes aren't useful inside a chat prompt.
app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });

  const ext = extFromName(file.originalname);

  try {
    if (ext === 'zip') {
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();
      const files = [];
      let totalUsed = 0;

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryData = entry.getData();
        const entryExt = extFromName(entry.entryName);
        const isTexty = TEXTY_EXTENSIONS.has(entryExt) || looksLikeText(entryData);

        if (isTexty && totalUsed < MAX_TOTAL_TEXT) {
          const text = entryData.toString('utf8').slice(0, MAX_FILE_TEXT);
          totalUsed += text.length;
          files.push({ name: entry.entryName, size: entryData.length, content: text, truncated: entryData.length > MAX_FILE_TEXT });
        } else {
          files.push({ name: entry.entryName, size: entryData.length, content: null, truncated: false });
        }
      }

      return res.json({
        type: 'zip',
        name: file.originalname,
        size: file.size,
        fileCount: files.length,
        files,
      });
    }

    // Non-zip: text or binary
    const isTexty = TEXTY_EXTENSIONS.has(ext) || looksLikeText(file.buffer);
    if (isTexty) {
      const content = file.buffer.toString('utf8').slice(0, MAX_FILE_TEXT);
      return res.json({
        type: 'text',
        name: file.originalname,
        size: file.size,
        content,
        truncated: file.buffer.length > MAX_FILE_TEXT,
      });
    }

    return res.json({
      type: 'binary',
      name: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      note: 'Binary file — raw content is not readable as text, only metadata is attached.',
    });
  } catch (err) {
    res.status(500).json({ error: `Could not process file: ${err.message}` });
  }
});

// Main chat endpoint - streams tokens back via SSE
app.post('/api/chat', requireDB, requireAuth, async (req, res) => {
  const { messages, systemPrompt, temperature } = req.body || {};
  const apiKey = req.headers['x-together-key'] || TOGETHER_API_KEY;
  const model = req.headers['x-together-model'] || TOGETHER_MODEL;

  if (!apiKey) {
    return res.status(500).json({ error: 'TOGETHER_API_KEY is not set in .env (or add it in Settings).' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  // ---------- Free tier enforcement ----------
  const user = req.user;
  if (user.plan !== 'pro' && user.messageCount >= user.freeLimit) {
    return res.status(402).json({
      error: 'Free limit reached. Upgrade to Pro for unlimited messages.',
      code: 'UPGRADE_REQUIRED',
      messagesLeft: 0,
    });
  }
  if (user.plan !== 'pro') {
    user.messageCount += 1;
    await user.save();
  }

  const payloadMessages = [];
  if (systemPrompt && systemPrompt.trim()) {
    payloadMessages.push({ role: 'system', content: systemPrompt.trim() });
  }
  payloadMessages.push(...messages);

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const upstream = await fetch(TOGETHER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: payloadMessages,
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        max_tokens: 8192,
        stream: true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      send({ error: `Together API error ${upstream.status}: ${errText}` });
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;
        try {
          const json = JSON.parse(dataStr);
          const token = json.choices?.[0]?.delta?.content || '';
          if (json.choices?.[0]?.finish_reason) finishReason = json.choices[0].finish_reason;
          if (token) send({ token });
        } catch (e) {
          // ignore malformed chunk
        }
      }
    }
    send({
      done: true,
      finishReason,
      messagesLeft: user.plan === 'pro' ? null : Math.max(user.freeLimit - user.messageCount, 0),
      plan: user.plan,
    });
    res.end();
  } catch (err) {
    send({ error: err.message || 'Unknown server error' });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`OpsMind is running -> http://localhost:${PORT}`);
  console.log(`Model: ${TOGETHER_MODEL} | API key set: ${!!TOGETHER_API_KEY}`);
});
