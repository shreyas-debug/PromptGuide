# PromptGuide — Prompt Optimizer for VS Code

Optimize your AI prompts directly inside VS Code. PromptGuide analyzes prompt text for token usage, verbosity, and structural quality, helping you write premium, token-efficient instructions.

## 🚀 Features

- **Live Token Counter (Status Bar)**: Real-time token estimations for `.md`, `.txt`, and `.prompt` files. Compares original vs. optimized tokens so you can see your savings at a glance.
- **Inline Diagnostics & Warnings**: Automatically flags common prompt issues (e.g., lack of role context, no output format constraint, action-less verbs, filler words).
- **One-Click Quick Fixes**: Prepend roles, add format constraints, strip filler phrases, or suppress warnings instantly from the VS Code lightbulb menu (`Ctrl+.`).
- **Interactive Optimizer Panel**: View detailed feedback and quality score breakdown (Clarity, Vocabulary, Actionability, Specificity, Brevity) in a visual dashboard beside your editor.
- **Copilot Chat Participant**: Ask `@promptguide` directly in GitHub Copilot/VS Code Chat. Use `/score`, `/optimize`, or `/tokens` for inline prompt engineering.

## 📦 Installation

To test or run PromptGuide locally:
1. Open the `vscode-extension` directory in VS Code.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to compile the package.
4. Press `F5` to open the Extension Development Host window.

## ⚙️ Settings

Customize the target AI model tokenizer:
- `promptguide.tokenModel`: Set target model to **Auto (Universal)**, **GPT-4**, **GPT-3.5**, **Claude**, or **Llama/Mistral/Gemma**.
- `promptguide.enableStatusBar`: Toggle the status bar token counter.
- `promptguide.enableCodeLens`: Toggle token overlays above markdown code blocks.
