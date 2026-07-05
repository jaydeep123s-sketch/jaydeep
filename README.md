# OpsMind

Ek general-purpose AI assistant chat app — Claude/ChatGPT jaisa, jo **har kaam** kare (code, DevOps, docs, files, writing, interview prep, etc.) — powered by **DeepSeek V4 Pro** via **Together AI**.

## Features
- 🤖 General-purpose assistant persona — coding, DevOps/Cloud, writing, research, analysis, interview prep, sab kuch, ek hi chat me
- 📊 Auto Mermaid diagrams — multi-step flows seedhe chat me visual diagram ban ke render hote hain
- 📈 Auto Chart.js charts — comparisons/metrics colorful chart me dikhte hain
- ⚡ One-click quick-prompt chips — Write Code, Summarize a File, Terraform IaC, DevSecOps Scan, Explain a Concept, Interview Prep
- Streaming replies (typewriter effect, jaisa Claude/ChatGPT me hota hai)
- Multiple chats, sidebar history — localStorage me save + MongoDB me backup (login ke baad), so purani chats/searches hamesha stored rehte hain
- Markdown rendering + syntax-highlighted code blocks + copy/download button
- File attach — **koi bhi file type** (including `.zip` archives): zip upload karne par sab text files uske andar se automatically extract ho ke context me chali jaati hain; binary files (images, exe, etc.) sirf metadata ke saath attach hoti hain
- Editable system prompt / persona + temperature control (Settings) — chaho to default persona override kar sakte ho
- Export: Markdown / PDF / Word (.docx) per message, poori chat ZIP me export

## Setup

```bash
cd deepchat
npm install
cp .env.example .env
```

`.env` file open karke:
1. `TOGETHER_API_KEY` me apni Together AI key daalo (https://api.together.ai/settings/api-keys)
2. `TOGETHER_MODEL` me DeepSeek V4 ka exact model id daalo. Together ke dashboard/models page pe confirm kar sakte ho.

Phir run karo:

```bash
npm start
```

Browser me kholo: `http://localhost:3000`

## Architecture
- `server.js` — Express backend, jo Together AI ke `/v1/chat/completions` endpoint ko stream mode me call karta hai aur SSE (Server-Sent Events) se frontend ko token-by-token bhejta hai. API key sirf backend pe rehti hai (frontend me expose nahi hoti).
- `public/` — Vanilla JS frontend (no build step chahiye). `marked.js` markdown render karta hai, `highlight.js` code syntax highlight karta hai, `mermaid.js` diagrams render karta hai, `chart.js` colorful charts render karta hai.

## Quick-prompt chips kaise kaam karte hain
`public/app.js` me `QUICK_PROMPTS` array hai — yaha se naye role/chips (jaise SRE, GitLab CI, Ansible) add kar sakte ho, bas ek naya object push karo:
```js
{ emoji: '🐙', label: 'GitLab CI', cls: 'iac', prompt: 'Apna prompt yaha likho...' }
```

## Aage badhane ke liye ideas
- Electron wrap kar ke desktop app bana sakte ho
- Supabase auth + per-user chat sync add kar sakte ho
- Rate limiting / usage tracking backend me add karo agar public deploy karna hai

## New: Accounts, Free/Pro plans, Payments & Cloud Database

OpsMind now has:
- **Login / Sign up** (JWT-based) — every user has their own account.
- **20 free messages** per account, then a paywall (`Upgrade to Pro`) unlocks unlimited messages.
- **PhonePe payments** for the Pro upgrade.
- **MongoDB Atlas** (free tier) — every chat and every message is saved to the database, tied to the logged-in user, so history survives across devices/browsers.
- **English UI** throughout.
- Response **compression** and **static asset caching** enabled for faster load times.

### 1. Set up MongoDB Atlas (free)
1. Create a free cluster at https://www.mongodb.com/cloud/atlas/register
2. Add a database user + allow network access from anywhere (0.0.0.0/0) for Railway.
3. Copy the connection string into `MONGODB_URI` in `.env`.

### 2. Set up PhonePe
1. Register at https://business.phonepe.com and get your **Merchant ID** and **Salt Key** (start in `SANDBOX` mode for testing).
2. Fill in `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_ENV` in `.env`.
3. Set `PRO_PRICE_PAISE` to your Pro plan price (in paise, e.g. `19900` = ₹199).
4. Set `APP_BASE_URL` to your real deployed URL once you deploy (PhonePe needs this to redirect back).

### 3. Generate a JWT secret
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Paste the output into `JWT_SECRET` in `.env`.

### 4. Deploy to Railway
1. Push this project to a GitHub repo.
2. On https://railway.app, create a new project → "Deploy from GitHub repo".
3. In Railway's **Variables** tab, add all the variables from `.env.example` with your real values.
4. Railway auto-detects Node.js and runs `npm start`. Once deployed, copy your Railway URL into `APP_BASE_URL` (and update it again if it changes).
5. Redeploy after changing `APP_BASE_URL` so PhonePe redirects work correctly.

### How the free-tier limit works
Each account starts on the `free` plan with `FREE_MESSAGE_LIMIT` (default 20) messages. Every AI reply consumes one message. Once the limit is hit, the chat endpoint returns HTTP 402 and the frontend shows the "Upgrade to Pro" modal. After a successful PhonePe payment, the account is automatically upgraded to `pro` (unlimited).
"# jaydeep" 
