# PromptGuide: An Analytical Toolkit for Prompt Evaluation and Refinement

*A multi-platform prompt engineering toolkit — available as a Chrome Extension, a VS Code Extension (on the Marketplace), and a Web App.*

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=promptguide.promptguide)
[![Live Demo](https://img.shields.io/badge/Web%20App-Live%20Demo-green)](https://prompt-guide-ten.vercel.app/)

---

## Project Description

PromptGuide addresses a critical gap in prompt engineering: the lack of objective, systematic feedback. While prompt engineering has become essential for effective AI interactions, practitioners often rely on trial-and-error or subjective assessments. This tool introduces a hybrid architecture that combines deterministic evaluation with intelligent refinement — available wherever you work.

---

## 🧩 Platforms

### 1. 🔷 VS Code Extension *(New — Published on Marketplace)*

Optimize AI prompts directly inside VS Code without leaving your editor.

**Install**: Search **"PromptGuide"** in the VS Code Extensions panel (`Ctrl+Shift+X`), or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=promptguide.promptguide).

**Features:**
- **Live Token Counter** — Real-time token estimates in the status bar for `.md`, `.txt`, and `.prompt` files
- **Inline Diagnostics** — Automatically flags missing role context, no output format, filler phrases, and weak action verbs
- **One-Click Quick Fixes** — Apply fixes instantly via the VS Code lightbulb menu (`Ctrl+.`)
- **Optimizer Panel** — Visual score breakdown across Clarity, Vocabulary, Actionability, Specificity, and Brevity
- **Copilot Chat Participant** — Use `@promptguide /optimize`, `/score`, or `/tokens` directly in GitHub Copilot Chat
- **Zero LLM calls** — All analysis and transforms are deterministic and rule-based; works fully offline

**Source:** [`vscode-extension/`](./vscode-extension/)

---

### 2. 🌐 Web App

A standalone web interface for prompt evaluation and AI-powered refinement.

**Live demo:** https://prompt-guide-ten.vercel.app/

**Features:**
- Metric-based prompt scoring (Clarity, Specificity, Actionability)
- AI-powered refinement via Groq API
- Refinement goals ("gauntlets") for targeted improvements

**Source:** [`frontend/`](./frontend/)

---

### 3. 🟡 Chrome Extension

Proactive prompt refinement directly in any web text box.

**Features:**
- **Proactive Mode** — Pause typing in any text box and a "Refine ✨" button appears
- **Side Panel** — Detailed analysis and manual prompt evaluation
- Works on any webpage with text input fields

**Source:** [`chrome-extension/`](./chrome-extension/)

---

## 🗂 Project Structure

```
prompt-guide-project/
├── vscode-extension/        ← VS Code Extension (published on Marketplace)
│   ├── src/
│   │   ├── extension.ts
│   │   ├── chat/            ← @promptguide Copilot Chat participant
│   │   ├── core/            ← Evaluator, transformers, token counter
│   │   ├── providers/       ← Diagnostics, CodeLens, Quick Fix, Status Bar
│   │   └── webview/         ← Optimizer panel UI
│   ├── data/                ← Verbosity rules JSON
│   ├── media/               ← Extension icons
│   └── package.json
├── frontend/                ← Web App (Vercel)
├── chrome-extension/        ← Chrome Extension
├── backend/                 ← Python/Flask API
└── backend-api/
```

---

## Technology Stack

### VS Code Extension
- **TypeScript** — Extension logic
- **esbuild** — Bundler
- **gpt-tokenizer** — Exact GPT-4/3.5 token counts
- **compromise** — NLP for filler phrase detection
- **@huggingface/transformers** — MiniLM semantic deduplication (runs locally, no API)

### Web App & Backend
- **Python / Flask** — RESTful API
- **NLTK / textstat** — NLP and readability metrics
- **sentence-transformers** — Semantic similarity
- **Groq API** — LLM-powered prompt refinement
- **Vanilla JS / HTML5 / CSS3** — Frontend

---

## Setup and Installation

### VS Code Extension (Local Development)
```bash
cd vscode-extension
npm install
npm run build
# Press F5 in VS Code to launch the Extension Host
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
# Add API_KEY=your_key to a .env file
python run.py
# Server starts at http://localhost:5000
```

### Chrome Extension
1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `chrome-extension/` folder

---

*Built with ❤️ for the prompt engineering community*
