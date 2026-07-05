// ---------- General-purpose AI assistant persona (default system prompt) ----------
const DEFAULT_SYSTEM_PROMPT = `You are OpsMind — a general-purpose AI assistant that can help with ANY task, the same way Claude/ChatGPT would. Do not limit yourself to one domain.

How you must answer, always:
1. Help with EVERYTHING — coding in any language, DevOps/Cloud/Terraform/CI-CD, writing, research, analysis, math, learning/tutoring, career and interview prep, resumes, planning, brainstorming, summarizing or analyzing uploaded files, and everyday questions. Never say a topic is "out of scope" unless it's unsafe.
2. Be extremely practical — give copy-paste-ready code, configs, or scripts whenever relevant. Never give vague theory when a concrete, working answer is possible.
3. Structure longer answers with clear markdown headings, numbered steps, and bullet points so they're scannable. Use emojis sparingly as section markers when it genuinely helps readability.
4. Whenever a workflow, pipeline, architecture, or process has more than 2 steps or components, you may include a \`\`\`mermaid diagram so the user can see the flow.
5. When comparing options, use a markdown table.
6. Adapt to the user's level automatically — explain fundamentals simply for beginners, and skip straight to advanced detail for experts.
7. If the user attaches a file (including files extracted from a .zip), read its content carefully and use it to ground your answer — reference specific parts of it rather than guessing.
8. Keep the tone friendly, direct, and helpful — assume the user wants their task done fast with zero friction, but never skip safety-critical or correctness-critical details.
9. The user often communicates in Hinglish (Hindi-English mix) — feel free to mirror that naturally if they write that way.`;

// ---------- Auth state ----------
let authToken = localStorage.getItem('opsmind_token') || null;
let currentUser = null; // { id, name, email, plan, messageCount, freeLimit, messagesLeft }
let authMode = 'login'; // 'login' | 'register'

function authHeaders() {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// ---------- State ----------
let chats = JSON.parse(localStorage.getItem('opsmind_chats') || '{}');
let activeChatId = null;
let settings = JSON.parse(localStorage.getItem('opsmind_settings') || '{}');
settings = {
  apiKey: settings.apiKey || '',
  systemPrompt: settings.systemPrompt || '',
  temperature: typeof settings.temperature === 'number' ? settings.temperature : 0.7,
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const messagesEl = $('messages');
const emptyState = $('emptyState');
const chatListEl = $('chatList');
const chatTitleEl = $('chatTitle');
const promptInput = $('promptInput');
const sendBtn = $('sendBtn');
const newChatBtn = $('newChatBtn');
const attachBtn = $('attachBtn');
const fileInput = $('fileInput');
const attachChip = $('attachChip');
const attachName = $('attachName');
const attachRemove = $('attachRemove');
const settingsBtn = $('settingsBtn');
const modalOverlay = $('modalOverlay');
const modalCancel = $('modalCancel');
const modalSave = $('modalSave');
const apiKeyInput = $('apiKeyInput');
const systemPromptInput = $('systemPromptInput');
const tempInput = $('tempInput');
const tempValue = $('tempValue');

// Auth + plan/billing DOM
const authOverlay = $('authOverlay');
const authTitle = $('authTitle');
const authSubtitle = $('authSubtitle');
const authError = $('authError');
const authNameLabel = $('authNameLabel');
const authName = $('authName');
const authEmail = $('authEmail');
const authPassword = $('authPassword');
const authSubmit = $('authSubmit');
const authToggleText = $('authToggleText');
const authToggleLink = $('authToggleLink');
const planBadge = $('planBadge');
const planUsage = $('planUsage');
const upgradeBtn = $('upgradeBtn');
const upgradeOverlay = $('upgradeOverlay');
const upgradeCancel = $('upgradeCancel');
const upgradeConfirm = $('upgradeConfirm');
const upgradeError = $('upgradeError');
const logoutBtn = $('logoutBtn');

let pendingAttachment = null; // { name, content }

// ---------- Auth UI ----------
function renderPlanUI() {
  if (!currentUser) return;
  const isPro = currentUser.plan === 'pro';
  planBadge.textContent = isPro ? 'Pro' : 'Free';
  planBadge.className = 'plan-badge' + (isPro ? ' pro' : '');
  planUsage.textContent = isPro ? 'Unlimited messages' : `${currentUser.messagesLeft} / ${currentUser.freeLimit} left`;
  upgradeBtn.style.display = isPro ? 'none' : 'block';
}

function setAuthMode(mode) {
  authMode = mode;
  authError.style.display = 'none';
  if (mode === 'login') {
    authTitle.textContent = 'Welcome back';
    authSubtitle.textContent = 'Log in to continue your DevOps chats.';
    authNameLabel.style.display = 'none';
    authName.style.display = 'none';
    authSubmit.textContent = 'Log in';
    authToggleText.textContent = 'New here?';
    authToggleLink.textContent = 'Create an account';
  } else {
    authTitle.textContent = 'Create your account';
    authSubtitle.textContent = 'Sign up free — includes 20 messages to try OpsMind.';
    authNameLabel.style.display = 'block';
    authName.style.display = 'block';
    authSubmit.textContent = 'Create account';
    authToggleText.textContent = 'Already have an account?';
    authToggleLink.textContent = 'Log in';
  }
}
authToggleLink.onclick = (e) => {
  e.preventDefault();
  setAuthMode(authMode === 'login' ? 'register' : 'login');
};

async function submitAuth() {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();
  authError.style.display = 'none';

  if (!email || !password || (authMode === 'register' && !name)) {
    authError.textContent = 'Please fill in all fields.';
    authError.style.display = 'block';
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = authMode === 'login' ? 'Logging in...' : 'Creating account...';
  try {
    const res = await fetch(`/api/auth/${authMode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authMode === 'login' ? { email, password } : { name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('opsmind_token', authToken);

    authOverlay.classList.remove('open');
    renderPlanUI();
    await loadChatsFromServer();
  } catch (err) {
    authError.textContent = err.message;
    authError.style.display = 'block';
  } finally {
    authSubmit.disabled = false;
    setAuthMode(authMode);
  }
}
authSubmit.onclick = submitAuth;
[authEmail, authPassword, authName].forEach((el) => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
});

function logout() {
  localStorage.removeItem('opsmind_token');
  authToken = null;
  currentUser = null;
  chats = {};
  saveChats();
  activeChatId = null;
  setAuthMode('login');
  authOverlay.classList.add('open');
}
logoutBtn.onclick = logout;

async function requireAuthOrShowScreen() {
  if (!authToken) {
    setAuthMode('login');
    authOverlay.classList.add('open');
    return false;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!res.ok) throw new Error('session expired');
    const data = await res.json();
    currentUser = data.user;
    renderPlanUI();
    return true;
  } catch (err) {
    logout();
    return false;
  }
}

// ---------- Server-side chat sync (so every chat is backed up, not just in this browser) ----------
let syncTimers = {};
function syncChatToServer(chat) {
  if (!authToken || !chat) return;
  clearTimeout(syncTimers[chat.id]);
  syncTimers[chat.id] = setTimeout(() => {
    fetch(`/api/chats/${encodeURIComponent(chat.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: chat.title, messages: chat.messages }),
    }).catch(() => {});
  }, 600); // debounce so fast typing/streaming doesn't spam the server
}

async function loadChatsFromServer() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/chats', { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    for (const c of data.chats || []) {
      // Server is the source of truth per account; keep local edits only if server has nothing for that id.
      chats[c.clientId] = {
        id: c.clientId,
        title: c.title,
        messages: c.messages.map((m) => ({ role: m.role, content: m.content })),
        createdAt: new Date(c.createdAt).getTime(),
      };
    }
    saveChats();
    const ids = Object.keys(chats);
    activeChatId = ids.length ? ids.sort((a, b) => chats[b].createdAt - chats[a].createdAt)[0] : createChat();
    renderChatList();
    renderMessages();
  } catch (err) {}
}

// ---------- Upgrade to Pro (PhonePe) ----------
upgradeBtn.onclick = () => {
  upgradeError.style.display = 'none';
  upgradeOverlay.classList.add('open');
};
upgradeCancel.onclick = () => upgradeOverlay.classList.remove('open');
upgradeOverlay.onclick = (e) => { if (e.target === upgradeOverlay) upgradeOverlay.classList.remove('open'); };
upgradeConfirm.onclick = async () => {
  upgradeError.style.display = 'none';
  upgradeConfirm.disabled = true;
  upgradeConfirm.textContent = 'Redirecting to PhonePe...';
  try {
    const res = await fetch('/api/payment/phonepe/initiate', { method: 'POST', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start payment.');
    window.location.href = data.redirectUrl;
  } catch (err) {
    upgradeError.textContent = err.message;
    upgradeError.style.display = 'block';
    upgradeConfirm.disabled = false;
    upgradeConfirm.textContent = 'Pay with PhonePe';
  }
};

function handlePaymentRedirectResult() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('payment');
  if (!status) return;
  window.history.replaceState({}, '', window.location.pathname);
  if (status === 'success') {
    alert('Payment successful — you are now on the Pro plan with unlimited messages!');
  } else {
    alert('Payment did not complete. You can try again anytime from "Upgrade to Pro".');
  }
}

marked.setOptions({
  breaks: true,
  highlight: null, // handled manually below
});

if (window.mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      background: '#0f1626',
      primaryColor: '#1b2745',
      primaryTextColor: '#e7ebf3',
      primaryBorderColor: '#6366f1',
      lineColor: '#2dd4bf',
      secondaryColor: '#1b2745',
      tertiaryColor: '#141d33',
    },
  });
}
let mermaidSeq = 0;

// ---------- Chat storage helpers ----------
function saveChats() {
  localStorage.setItem('opsmind_chats', JSON.stringify(chats));
  if (activeChatId && chats[activeChatId]) syncChatToServer(chats[activeChatId]);
}
function saveSettings() {
  localStorage.setItem('opsmind_settings', JSON.stringify(settings));
}
function createChat() {
  const id = 'c' + Date.now();
  chats[id] = { id, title: 'New chat', messages: [], createdAt: Date.now() };
  saveChats();
  return id;
}
function renderChatList() {
  chatListEl.innerHTML = '';
  const sorted = Object.values(chats).sort((a, b) => b.createdAt - a.createdAt);
  for (const chat of sorted) {
    const item = document.createElement('div');
    item.className = 'chat-item' + (chat.id === activeChatId ? ' active' : '');
    item.innerHTML = `<span class="title">${escapeHtml(chat.title)}</span><button class="del" title="Delete">&times;</button>`;
    item.querySelector('.title').onclick = () => switchChat(chat.id);
    item.querySelector('.del').onclick = (e) => {
      e.stopPropagation();
      const deletedId = chat.id;
      delete chats[deletedId];
      saveChats();
      if (authToken) fetch(`/api/chats/${encodeURIComponent(deletedId)}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {});
      if (activeChatId === deletedId) {
        const remaining = Object.keys(chats);
        activeChatId = remaining.length ? remaining[0] : createChat();
      }
      renderChatList();
      renderMessages();
    };
    chatListEl.appendChild(item);
  }
}
function switchChat(id) {
  activeChatId = id;
  renderChatList();
  renderMessages();
}

// ---------- Rendering ----------
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderMarkdown(text) {
  const html = marked.parse(text || '');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  wrapper.querySelectorAll('pre code').forEach((block) => {
    const langMatch = /language-(\w+)/.exec(block.className || '');
    const lang = langMatch ? langMatch[1].toLowerCase() : '';
    const pre = block.parentElement;

    // 📊 Mermaid diagrams — architecture / flow / sequence diagrams
    if (lang === 'mermaid') {
      const raw = block.textContent;
      const container = document.createElement('div');
      container.className = 'diagram-block';
      const label = document.createElement('div');
      label.className = 'diagram-label';
      label.textContent = '📊 Diagram';
      const mDiv = document.createElement('div');
      mDiv.className = 'mermaid';
      mDiv.textContent = raw;
      container.appendChild(label);
      container.appendChild(mDiv);
      pre.parentNode.replaceChild(container, pre);
      return;
    }

    // 📈 Chart.js charts — ```chart { "type": "bar", "labels": [...], "datasets": [...] }
    if (lang === 'chart') {
      let spec = null;
      try { spec = JSON.parse(block.textContent); } catch (e) { spec = null; }
      if (spec) {
        const container = document.createElement('div');
        container.className = 'chart-block';
        const label = document.createElement('div');
        label.className = 'diagram-label';
        label.textContent = '📈 Chart';
        const canvasWrap = document.createElement('div');
        canvasWrap.className = 'chart-canvas-wrap';
        const canvas = document.createElement('canvas');
        canvas.className = 'chart-canvas';
        canvasWrap.appendChild(canvas);
        container.appendChild(label);
        container.appendChild(canvasWrap);
        pre.parentNode.replaceChild(container, pre);
        container.dataset.chartSpec = JSON.stringify(spec);
        return;
      }
    }

    hljs.highlightElement(block);
    const container = document.createElement('div');
    container.className = 'code-block';

    const header = document.createElement('div');
    header.className = 'code-block-header';
    const langLabel = document.createElement('span');
    langLabel.className = 'code-block-lang';
    langLabel.textContent = lang || 'text';
    const btnBar = document.createElement('div');
    btnBar.className = 'code-btn-bar';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(block.textContent);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
    };

    const dlBtn = document.createElement('button');
    dlBtn.className = 'copy-btn';
    dlBtn.textContent = 'Download';
    dlBtn.onclick = () => downloadText(block.textContent, extensionForLang(block.className));

    btnBar.appendChild(copyBtn);
    btnBar.appendChild(dlBtn);
    header.appendChild(langLabel);
    header.appendChild(btnBar);
    pre.parentNode.insertBefore(container, pre);
    container.appendChild(header);
    container.appendChild(pre);
  });
  return wrapper.innerHTML;
}

const CHART_PALETTE = ['#2dd4bf', '#6366f1', '#f59e0b', '#f87171', '#34d399', '#a78bfa', '#60a5fa', '#fb923c'];

function activateVisuals(root) {
  if (window.mermaid) {
    const nodes = root.querySelectorAll('.mermaid:not([data-processed])');
    nodes.forEach((node) => {
      node.setAttribute('data-processed', 'true');
      const id = 'mmd-' + Date.now() + '-' + (mermaidSeq++);
      const code = node.textContent;
      mermaid
        .render(id, code)
        .then(({ svg }) => { node.innerHTML = svg; })
        .catch((err) => {
          node.innerHTML = `<div class="diagram-error">⚠️ Diagram render error: ${escapeHtml(err.message || String(err))}</div>`;
        });
    });
  }
  if (window.Chart) {
    root.querySelectorAll('.chart-block:not([data-rendered])').forEach((container) => {
      container.setAttribute('data-rendered', 'true');
      let spec;
      try { spec = JSON.parse(container.dataset.chartSpec || '{}'); } catch (e) { return; }
      const canvas = container.querySelector('canvas');
      const datasets = (spec.datasets || []).map((ds, i) => ({
        label: ds.label || `Series ${i + 1}`,
        data: ds.data || [],
        backgroundColor: ds.data && ds.data.map ? ds.data.map((_, j) => CHART_PALETTE[(i + j) % CHART_PALETTE.length]) : CHART_PALETTE[i % CHART_PALETTE.length],
        borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
        borderWidth: 2,
        tension: 0.35,
      }));
      new Chart(canvas.getContext('2d'), {
        type: spec.type || 'bar',
        data: { labels: spec.labels || [], datasets },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#e7ebf3' } },
            title: spec.title ? { display: true, text: spec.title, color: '#e7ebf3' } : undefined,
          },
          scales: (spec.type === 'pie' || spec.type === 'doughnut') ? {} : {
            x: { ticks: { color: '#8b95a7' }, grid: { color: '#202b45' } },
            y: { ticks: { color: '#8b95a7' }, grid: { color: '#202b45' } },
          },
        },
      });
    });
  }
}

const LANG_EXT = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py',
  bash: 'sh', sh: 'sh', shell: 'sh', json: 'json', html: 'html', xml: 'xml',
  css: 'css', yaml: 'yml', yml: 'yml', go: 'go', golang: 'go', java: 'java',
  c: 'c', cpp: 'cpp', 'c++': 'cpp', sql: 'sql', dockerfile: 'Dockerfile',
  markdown: 'md', md: 'md', ruby: 'rb', php: 'php', rust: 'rs',
};
function extensionForLang(className) {
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1].toLowerCase() : '';
  return LANG_EXT[lang] || 'txt';
}
function downloadText(content, ext) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `opsmind-snippet.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
function exportMessageAsMarkdown(text) {
  downloadText(text, 'md');
}
async function downloadFromServer(url, body, fallbackName) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    const blob = await res.blob();
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = fallbackName;
    a.click();
    URL.revokeObjectURL(dlUrl);
  } catch (err) {
    alert('Export fail hua: ' + err.message);
  }
}
function exportMessageAsPdf(text) {
  downloadFromServer('/api/export/pdf', { text, filename: 'opsmind-response.pdf' }, 'opsmind-response.pdf');
}
function exportMessageAsDocx(text) {
  downloadFromServer('/api/export/docx', { text, filename: 'opsmind-response.docx' }, 'opsmind-response.docx');
}
function exportChatAsZip() {
  const chat = chats[activeChatId];
  if (!chat || chat.messages.length === 0) return alert('Ye chat khaali hai, export karne ke liye kuch nahi hai.');
  downloadFromServer(
    '/api/export/zip',
    { messages: chat.messages, chatTitle: chat.title },
    `${chat.title.replace(/[^a-z0-9\-_]/gi, '_').slice(0, 40)}.zip`
  );
}

function renderMessages() {
  const chat = chats[activeChatId];
  messagesEl.innerHTML = '';
  if (!chat || chat.messages.length === 0) {
    messagesEl.appendChild(emptyState);
    chatTitleEl.textContent = 'New chat';
    return;
  }
  emptyState.remove();
  chatTitleEl.textContent = chat.title;
  for (const msg of chat.messages) {
    appendMessageEl(msg.role, msg.content, false);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessageEl(role, content, animate = true) {
  if (messagesEl.contains(emptyState)) emptyState.remove();
  const row = document.createElement('div');
  row.className = `msg-row ${role}`;
  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerHTML = '<span class="sonar tiny"><span class="sonar-dot"></span><span class="sonar-ring"></span></span>';
    row.appendChild(avatar);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = role === 'assistant' ? renderMarkdown(content) : escapeHtml(content).replace(/\n/g, '<br>');
  row.appendChild(bubble);
  if (role === 'assistant') activateVisuals(bubble);

  if (role === 'assistant') {
    const actions = buildActionBar(bubble);
    const wrapper = document.createElement('div');
    wrapper.className = 'message-block';
    wrapper.appendChild(row);
    wrapper.appendChild(actions);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    bubble.dataset.raw = content;
    return bubble;
  }

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  bubble.dataset.raw = content;
  return bubble;
}

// ---------- Related YouTube videos (Perplexity-style sources row) ----------
async function renderRelatedVideos(query, wrapper) {
  if (!authToken || !query) return;
  try {
    const res = await fetch('/api/related-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.videos || !data.videos.length) return;

    const box = document.createElement('div');
    box.className = 'related-videos';
    box.innerHTML = '<div class="related-videos-title">📺 Related on YouTube</div>';
    const list = document.createElement('div');
    list.className = 'related-videos-list';
    for (const v of data.videos) {
      const link = document.createElement('a');
      link.className = 'related-video-card';
      link.href = v.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = `
        ${v.thumbnail ? `<img src="${v.thumbnail}" alt="" class="related-video-thumb" />` : '<span class="related-video-thumb related-video-thumb-fallback">▶</span>'}
        <span class="related-video-info">
          <span class="related-video-title">${escapeHtml(v.title)}</span>
          <span class="related-video-channel">${escapeHtml(v.channel || '')}</span>
        </span>`;
      list.appendChild(link);
    }
    box.appendChild(list);
    wrapper.appendChild(box);
  } catch (err) {}
}

function buildActionBar(bubble) {
  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-action';
  copyBtn.title = 'Copy';
  copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(bubble.dataset.raw || '');
    copyBtn.classList.add('flash');
    setTimeout(() => copyBtn.classList.remove('flash'), 1200);
  };

  const exportBtn = document.createElement('button');
  exportBtn.className = 'icon-action';
  exportBtn.title = 'Export';
  exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>';

  const menu = document.createElement('div');
  menu.className = 'export-menu';
  const opts = [
    ['Markdown (.md)', () => exportMessageAsMarkdown(bubble.dataset.raw || '')],
    ['PDF (.pdf)', () => exportMessageAsPdf(bubble.dataset.raw || '')],
    ['Word (.docx)', () => exportMessageAsDocx(bubble.dataset.raw || '')],
  ];
  for (const [label, fn] of opts) {
    const item = document.createElement('button');
    item.textContent = label;
    item.onclick = (e) => {
      e.stopPropagation();
      fn();
      menu.classList.remove('open');
    };
    menu.appendChild(item);
  }
  exportBtn.onclick = (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  };
  document.addEventListener('click', () => menu.classList.remove('open'));

  const exportWrap = document.createElement('div');
  exportWrap.className = 'export-wrap';
  exportWrap.appendChild(exportBtn);
  exportWrap.appendChild(menu);

  actions.appendChild(copyBtn);
  actions.appendChild(exportWrap);
  return actions;
}

async function streamAssistantReply(chat, assistantBubble) {
  let assistantText = assistantBubble.dataset.raw || '';
  let finishReason = null;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(settings.apiKey ? { 'x-together-key': settings.apiKey } : {}),
    },
    body: JSON.stringify({
      messages: chat.messages
        .map((m) => ({ role: m.role, content: m.content }))
        .concat(assistantText ? [{ role: 'assistant', content: assistantText }, { role: 'user', content: 'Continue exactly where you left off, no repetition.' }] : []),
      systemPrompt: (settings.systemPrompt && settings.systemPrompt.trim()) || DEFAULT_SYSTEM_PROMPT,
      temperature: settings.temperature,
    }),
  });

  if (res.status === 401) {
    logout();
    throw new Error('Your session expired — please log in again.');
  }
  if (res.status === 402) {
    const data = await res.json().catch(() => ({}));
    upgradeError.style.display = 'none';
    upgradeOverlay.classList.add('open');
    throw new Error(data.error || 'Free limit reached. Upgrade to Pro for unlimited messages.');
  }

  if (!res.body) throw new Error('No response stream from server.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
      if (!dataStr) continue;
      try {
        const json = JSON.parse(dataStr);
        if (json.error) {
          assistantText += `\n\n**Error:** ${json.error}`;
        } else if (json.token) {
          assistantText += json.token;
        }
        if (json.finishReason) finishReason = json.finishReason;
        if (json.done && currentUser) {
          currentUser.plan = json.plan || currentUser.plan;
          if (json.messagesLeft !== null && json.messagesLeft !== undefined) currentUser.messagesLeft = json.messagesLeft;
          renderPlanUI();
        }
        assistantBubble.innerHTML = renderMarkdown(assistantText);
        assistantBubble.dataset.raw = assistantText;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } catch (e) {}
    }
  }
  assistantBubble.innerHTML = renderMarkdown(assistantText);
  activateVisuals(assistantBubble);
  return { assistantText, finishReason };
}

function showContinueButton(chat, assistantBubble, row) {
  let btn = row.querySelector('.continue-btn');
  if (btn) btn.remove();
  btn = document.createElement('button');
  btn.className = 'continue-btn';
  btn.textContent = 'Reply looks cut off — Continue →';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Continuing...';
    assistantBubble.classList.add('cursor-blink');
    const { assistantText, finishReason } = await streamAssistantReply(chat, assistantBubble);
    assistantBubble.classList.remove('cursor-blink');
    chat.messages[chat.messages.length - 1].content = assistantText;
    saveChats();
    btn.remove();
    if (finishReason === 'length') showContinueButton(chat, assistantBubble, row);
  };
  row.appendChild(btn);
}

// ---------- Quick-prompts (general-purpose) ----------
const QUICK_PROMPTS = [
  { emoji: '💻', label: 'Write Code', cls: 'aws', prompt: 'Write a clean, well-commented function/script for the following task: ' },
  { emoji: '📝', label: 'Summarize a File', cls: 'azure', prompt: 'I am attaching a file — summarize its key points and flag anything that looks like an issue.' },
  { emoji: '🏗️', label: 'Terraform IaC', cls: 'iac', prompt: 'Design a multi-environment (dev/stage/prod) Terraform project structure with remote state, modules, and variables. Include best practices.' },
  { emoji: '🔒', label: 'DevSecOps Scan', cls: 'sec', prompt: 'Make my CI/CD pipeline DevSecOps-ready: add SAST, dependency scanning (SCA), container image scanning, and secret scanning. Recommend the best tools and give a pipeline flow diagram (mermaid).' },
  { emoji: '📊', label: 'Explain a Concept', cls: 'diagram', prompt: 'Explain the following concept simply, with an analogy and a mermaid diagram if it has multiple steps: ' },
  { emoji: '🎯', label: 'Interview Prep', cls: 'chart', prompt: 'Quiz me with senior-level interview questions on this topic, one at a time, and give feedback on my answers: ' },
];

function insertQuickPrompt(promptText) {
  promptInput.value = promptText;
  autoResize();
  promptInput.focus();
}

function renderQuickPrompts() {
  const grid = $('quickstartGrid');
  if (grid) {
    grid.innerHTML = '';
    QUICK_PROMPTS.forEach((qp) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `quick-card ${qp.cls}`;
      card.innerHTML = `<span class="quick-card-emoji">${qp.emoji}</span><span class="quick-card-label">${qp.label}</span>`;
      card.onclick = () => insertQuickPrompt(qp.prompt);
      grid.appendChild(card);
    });
  }
}

// ---------- Sending ----------
async function sendMessage() {
  const text = promptInput.value.trim();
  if (!text && !pendingAttachment) return;
  if (!authToken) { authOverlay.classList.add('open'); return; }
  if (currentUser && currentUser.plan !== 'pro' && currentUser.messagesLeft <= 0) {
    upgradeError.style.display = 'none';
    upgradeOverlay.classList.add('open');
    return;
  }

  if (!activeChatId) activeChatId = createChat();
  const chat = chats[activeChatId];

  let fullText = text;
  if (pendingAttachment) {
    fullText += `\n\n---\n${buildAttachmentText(pendingAttachment)}`;
  }

  chat.messages.push({ role: 'user', content: fullText });
  if (chat.title === 'New chat') {
    chat.title = text.slice(0, 40) || pendingAttachment.name;
  }
  saveChats();
  renderChatList();
  appendMessageEl('user', fullText);

  promptInput.value = '';
  autoResize();
  clearAttachment();
  sendBtn.disabled = true;

  const assistantRow = document.createElement('div');
  assistantRow.className = 'msg-row assistant';
  const assistantAvatar = document.createElement('div');
  assistantAvatar.className = 'msg-avatar';
  assistantAvatar.innerHTML = '<span class="sonar tiny"><span class="sonar-dot"></span><span class="sonar-ring"></span></span>';
  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'bubble';
  assistantRow.appendChild(assistantAvatar);
  assistantRow.appendChild(assistantBubble);
  if (messagesEl.contains(emptyState)) emptyState.remove();
  const assistantWrapper = document.createElement('div');
  assistantWrapper.className = 'message-block';
  assistantWrapper.appendChild(assistantRow);
  messagesEl.appendChild(assistantWrapper);
  assistantBubble.classList.add('cursor-blink');
  assistantBubble.dataset.raw = '';

  try {
    const { assistantText, finishReason } = await streamAssistantReply(chat, assistantBubble);
    assistantBubble.classList.remove('cursor-blink');
    chat.messages.push({ role: 'assistant', content: assistantText });
    saveChats();

    const actions = buildActionBar(assistantBubble);
    assistantWrapper.appendChild(actions);
    renderRelatedVideos(text.slice(0, 80) || chat.title, assistantWrapper);

    if (finishReason === 'length') showContinueButton(chat, assistantBubble, assistantWrapper);
  } catch (err) {
    assistantBubble.classList.remove('cursor-blink');
    if (err.message && err.message.toLowerCase().includes('upgrade')) {
      assistantWrapper.remove();
      chat.messages.pop(); // remove the user message too so they can resend after upgrading
      saveChats();
      renderChatList();
      renderMessages();
      sendBtn.disabled = false;
      return;
    }
    assistantBubble.innerHTML = renderMarkdown((assistantBubble.dataset.raw || '') + `\n\n**Error:** ${err.message}`);
    chat.messages.push({ role: 'assistant', content: assistantBubble.dataset.raw || '' });
    saveChats();
  }

  sendBtn.disabled = false;
  promptInput.focus();
}

// ---------- Attachments (any file type, including .zip archives) ----------
function clearAttachment() {
  pendingAttachment = null;
  attachChip.style.display = 'none';
  attachChip.classList.remove('is-loading');
  fileInput.value = '';
}

// Turns whatever /api/upload returned into markdown that gets appended to the message.
function buildAttachmentText(att) {
  if (att.kind === 'zip') {
    let out = `Attached ZIP: ${att.name} (${att.fileCount} files)\n`;
    for (const f of att.files) {
      if (f.content != null) {
        out += `\n**${f.name}**${f.truncated ? ' (truncated)' : ''}\n\`\`\`\n${f.content}\n\`\`\`\n`;
      } else {
        out += `\n- ${f.name} (${f.size} bytes) — binary, content not extracted\n`;
      }
    }
    return out;
  }
  if (att.kind === 'binary') {
    return `Attached file: ${att.name} (${att.mimetype || 'unknown type'}, ${att.size} bytes) — binary file, raw content not extractable as text.`;
  }
  return `Attached file: ${att.name}${att.truncated ? ' (truncated)' : ''}\n\`\`\`\n${att.content}\n\`\`\``;
}

attachBtn.onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if (!file) return;

  attachName.textContent = `Uploading ${file.name}...`;
  attachChip.style.display = 'inline-flex';
  attachChip.classList.add('is-loading');

  try {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch('/api/upload', {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Upload failed');

    pendingAttachment = { name: data.name, kind: data.type, content: data.content, files: data.files, fileCount: data.fileCount, mimetype: data.mimetype, size: data.size, truncated: data.truncated };
    attachName.textContent = data.type === 'zip' ? `${data.name} (${data.fileCount} files)` : data.name;
  } catch (err) {
    attachName.textContent = `Failed: ${err.message}`;
    pendingAttachment = null;
  } finally {
    attachChip.classList.remove('is-loading');
  }
};
attachRemove.onclick = clearAttachment;

// ---------- Input handling ----------
function autoResize() {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
}
promptInput.addEventListener('input', autoResize);
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
sendBtn.onclick = sendMessage;
newChatBtn.onclick = () => {
  activeChatId = createChat();
  renderChatList();
  renderMessages();
};
$('exportZipBtn').onclick = exportChatAsZip;

// ---------- Settings modal ----------
settingsBtn.onclick = () => {
  apiKeyInput.value = settings.apiKey;
  systemPromptInput.value = settings.systemPrompt;
  tempInput.value = settings.temperature;
  tempValue.textContent = settings.temperature;
  modalOverlay.classList.add('open');
};
modalCancel.onclick = () => modalOverlay.classList.remove('open');
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); };
tempInput.oninput = () => (tempValue.textContent = tempInput.value);
modalSave.onclick = () => {
  settings.apiKey = apiKeyInput.value.trim();
  settings.systemPrompt = systemPromptInput.value;
  settings.temperature = parseFloat(tempInput.value);
  saveSettings();
  modalOverlay.classList.remove('open');
};

// ---------- Init ----------
(async function init() {
  renderQuickPrompts();
  handlePaymentRedirectResult();

  const loggedIn = await requireAuthOrShowScreen();
  if (loggedIn) {
    await loadChatsFromServer();
  }

  const ids = Object.keys(chats);
  activeChatId = ids.length ? ids.sort((a, b) => chats[b].createdAt - chats[a].createdAt)[0] : createChat();
  renderChatList();
  renderMessages();
})();
