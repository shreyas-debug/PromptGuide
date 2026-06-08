# PromptGuide — Prompt Optimizer for VS Code

Optimize your AI prompts directly inside VS Code. PromptGuide analyzes prompt text for token usage, verbosity, and structural quality, helping you write premium, token-efficient instructions.

## 🚀 Features

- **Live Token Counter (Status Bar)**: Real-time token estimations for `.md`, `.txt`, and `.prompt` files. Compares original vs. optimized tokens so you can see your savings at a glance.
- **Inline Diagnostics & Warnings**: Automatically flags common prompt issues (e.g., lack of role context, no output format constraint, action-less verbs, filler words).
- **One-Click Quick Fixes**: Apply fixes instantly via the VS Code lightbulb menu (`Ctrl+.`).
- **Interactive Optimizer Panel**: View detailed feedback, quality score breakdowns, and configure settings in a visual dashboard beside your editor.
- **Prompt Diff View**: Inspect exact changes side-by-side in a native VS Code diff editor after optimizing.
- **Token Limit Mode**: Monitor token usage against a selected limit (presets: 4K, 8K, 16K, 32K, or Custom). The status bar dynamically highlights in warning (amber) or error (red) when thresholds are crossed.
- **Quality Trend Chart**: Analyze optimization progress per file with an interactive, SVG-based sparkline graph inside the panel.
- **Selection Hover breakdowns**: Highlight any portion of prompt text and hover to see its estimated token count and input costs (GPT-4o vs Claude 3.5 Sonnet) over 1,000 runs.
- **Copilot Chat Participant**: Ask `@promptguide` directly in GitHub Copilot Chat using `/score`, `/optimize`, or `/tokens`.

## 📦 Installation

To test or run PromptGuide locally:
1. Open the `vscode-extension` directory in VS Code.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to compile the package.
4. Press `F5` to open the Extension Development Host window.

## ⚙️ Settings

Customize PromptGuide's behavior:
- `promptguide.tokenModel`: Set target tokenizer to **Auto (Universal)**, **GPT-4**, **GPT-3.5**, **Claude**, or **Llama/Mistral/Gemma**.
- `promptguide.tokenBudget`: Set a target token ceiling. The status bar colors change as you approach or exceed it.
- `promptguide.enableStatusBar`: Toggle the status bar token counter.
- `promptguide.enableCodeLens`: Toggle token overlays above markdown code blocks.
- `promptguide.enableHovers`: Toggle selection hover token/cost breakdowns.
