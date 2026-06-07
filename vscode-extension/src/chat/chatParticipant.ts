// ============================================================
// chatParticipant.ts — @promptguide VS Code Chat Participant
// Responds to @promptguide in GitHub Copilot Chat
// Zero LLM calls from our side — pure rule-based analysis
// ============================================================
import * as vscode from 'vscode';
import { runFullEvaluation, type ScoreBreakdown } from '../core/evaluator';
import { estimateTokens, type ModelFamily } from '../core/tokenCounter';
import { optimizePrompt } from '../core/transformers';

export function registerChatParticipant(
  context: vscode.ExtensionContext
): vscode.Disposable {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _ctx: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
  ) => {
    const userPrompt = request.prompt.trim();

    if (!userPrompt) {
      stream.markdown(
        '👋 **PromptGuide** here! Send me any prompt text and I\'ll score and optimize it.\n\n' +
        'Commands:\n' +
        '- `/score` — Score your prompt\n' +
        '- `/optimize` — Score + apply optimizations\n' +
        '- `/tokens` — Token count across models\n\n' +
        '**Example:** `@promptguide /optimize Write a function that sorts a list in Python`'
      );
      return;
    }

    const model = vscode.workspace.getConfiguration('promptguide')
      .get<ModelFamily>('tokenModel', 'auto');

    // --- Handle slash commands ---
    if (request.command === 'score') {
      await handleScore(userPrompt, stream, model);
      return;
    }

    if (request.command === 'tokens') {
      await handleTokens(userPrompt, stream);
      return;
    }

    // Default and /optimize both run the full pipeline
    await handleOptimize(userPrompt, stream, model, context);
    return;
  };

  const participant = vscode.chat.createChatParticipant('promptguide.optimizer', handler);
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon128.png');

  return participant;
}

// ---- Score Only ----
async function handleScore(
  prompt: string,
  stream: vscode.ChatResponseStream,
  model: ModelFamily
): Promise<void> {
  const evaluation = runFullEvaluation(prompt);
  const tokenEst = estimateTokens(prompt, model);
  const prefix = tokenEst.isExact ? '' : '~';

  stream.markdown(`## 📊 Prompt Score: **${evaluation.finalScore}/100**\n\n`);
  stream.markdown(renderScoreBar(evaluation.finalScore));
  stream.markdown('\n\n### Breakdown\n');
  stream.markdown(renderBreakdownTable(evaluation.breakdown));
  stream.markdown(`\n### Feedback\n${evaluation.feedback}\n\n`);
  stream.markdown(`**Estimated tokens:** ${prefix}${tokenEst.count} *(${tokenEst.label})*\n`);
  stream.markdown(`**Detected domain:** \`${evaluation.detectedDomain}\`\n`);
  if (evaluation.detectedVerbs.length > 0) {
    stream.markdown(`**Action verbs found:** ${evaluation.detectedVerbs.slice(0, 3).join(', ')}\n`);
  }
}

// ---- Token Count Across Models ----
async function handleTokens(
  prompt: string,
  stream: vscode.ChatResponseStream
): Promise<void> {
  stream.markdown(`## 🔢 Token Estimates for Your Prompt\n\n`);
  stream.markdown(`> Note: Different AI models use different tokenizers. ` +
    `GPT counts are exact; others are approximated.\n\n`);

  stream.markdown('| Model | Tokens | Accuracy |\n');
  stream.markdown('|---|---|---|\n');

  const models: [ModelFamily, string][] = [
    ['gpt4', 'GPT-4 / GPT-4o'],
    ['gpt35', 'GPT-3.5-turbo'],
    ['claude', 'Claude (Anthropic)'],
    ['llama', 'Llama / Mistral / Gemma'],
    ['auto', 'Universal estimate'],
  ];

  for (const [model, label] of models) {
    const est = estimateTokens(prompt, model);
    const accuracy = est.isExact ? '✅ Exact' : `~${est.errorBound ?? '±15%'}`;
    const prefix = est.isExact ? '' : '~';
    stream.markdown(`| ${label} | **${prefix}${est.count}** | ${accuracy} |\n`);
  }

  stream.markdown('\n*Token counts shown are for the prompt text only, excluding system prompts.*\n');
}

// ---- Full Optimize ----
async function handleOptimize(
  prompt: string,
  stream: vscode.ChatResponseStream,
  model: ModelFamily,
  context: vscode.ExtensionContext
): Promise<void> {
  stream.progress('Analyzing prompt with PromptGuide (no AI used)...');

  const result = await optimizePrompt(
    prompt,
    context.extensionPath,
    context.globalStorageUri.fsPath,
    model
  );

  const scoreDelta = result.scoreOptimized.finalScore - result.scoreOriginal.finalScore;
  const tokenDelta = result.tokensSaved;
  const prefix = estimateTokens(prompt, model).isExact ? '' : '~';

  // Header
  stream.markdown(`## ✨ PromptGuide Optimization Report\n`);
  stream.markdown(`> **Zero AI used** — all changes are deterministic rule-based transforms.\n\n`);

  // Score comparison
  stream.markdown(`### 📊 Score\n`);
  stream.markdown(`| | Before | After |\n|---|---|---|\n`);
  stream.markdown(`| **Score** | ${result.scoreOriginal.finalScore}/100 | **${result.scoreOptimized.finalScore}/100** |\n`);
  stream.markdown(`| **Tokens** | ${prefix}${result.tokensOriginal} | **${prefix}${result.tokensOptimized}** |\n\n`);

  if (scoreDelta > 0) {
    stream.markdown(`🎯 Quality improved by **+${scoreDelta} points**\n`);
  }
  if (tokenDelta > 0) {
    stream.markdown(`💰 Token savings: **-${tokenDelta} tokens** (~${Math.round((tokenDelta / result.tokensOriginal) * 100)}% reduction)\n`);
  } else if (tokenDelta < 0) {
    stream.markdown(`📈 Prompt grew by ${Math.abs(tokenDelta)} tokens — quality additions that reduce iteration cost.\n`);
  }

  // Optimized prompt
  stream.markdown(`\n### 🔧 Optimized Prompt\n\`\`\`\n${result.optimized}\n\`\`\`\n`);

  // Rules applied
  if (result.rulesApplied.length > 0) {
    stream.markdown(`\n### 📋 Changes Made (${result.rulesApplied.length} rules applied)\n`);
    for (const rule of result.rulesApplied) {
      const tokenNote = rule.tokensSaved > 0
        ? ` *(saved ~${rule.tokensSaved} tokens)*`
        : rule.tokensSaved < 0
          ? ` *(added ~${Math.abs(rule.tokensSaved)} tokens for quality)*`
          : '';
      stream.markdown(`- **[${rule.transformer}]** ${rule.rule}${tokenNote}\n`);
    }

    if (result.usedSemanticAnalysis) {
      stream.markdown(`\n*🔬 Semantic analysis (MiniLM) was used to detect redundant sentences.*\n`);
    }
  } else {
    stream.markdown(`\n*No changes needed — your prompt already follows best practices!*\n`);
  }

  // Copy button
  stream.button({
    command: 'promptguide.copyToChat',
    title: '📋 Copy Optimized Prompt',
    arguments: [result.optimized],
  });
}

// ---- Helpers ----
function renderScoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  const label = score >= 70 ? '✅ Good' : score >= 40 ? '⚠️ Fair' : '❌ Needs Work';
  return `\`${bar}\` ${score}/100 ${label}`;
}

function renderBreakdownTable(breakdown: ScoreBreakdown): string {
  let table = '| Dimension | Score | Max |\n|---|---|---|\n';
  const maxes: Record<string, number> = {
    Clarity: 20, Vocabulary: 20, Actionability: 25, Specificity: 25, Brevity: 10,
  };
  for (const [key, value] of Object.entries(breakdown)) {
    const max = maxes[key] ?? 25;
    const bar = value === max ? '✅' : value > 0 ? '⚠️' : '❌';
    table += `| ${key} | ${value} | ${max} ${bar} |\n`;
  }
  return table;
}
