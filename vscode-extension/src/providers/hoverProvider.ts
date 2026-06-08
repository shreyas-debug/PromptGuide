// ============================================================
// hoverProvider.ts — Selection hover token counter & cost breakdowns
// Shows token counts and API input costs when hovering over selected text
// ============================================================
import * as vscode from 'vscode';
import { estimateTokens, type ModelFamily } from '../core/tokenCounter';
import { isPromptText } from '../core/evaluator';

export class PromptHoverProvider implements vscode.HoverProvider {
  constructor(private readonly config: vscode.WorkspaceConfiguration) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    // Respect user settings for hovers
    if (!this.config.get<boolean>('enableHovers', true)) {
      return undefined;
    }

    // Only active in valid prompt files
    if (!isPromptText(document.getText(), document.uri.fsPath, document.languageId)) {
      return undefined;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      return undefined;
    }

    const selection = editor.selection;
    if (!selection || selection.isEmpty) {
      return undefined;
    }

    // Only display hover if the hovered position falls inside the current selection
    if (!selection.contains(position)) {
      return undefined;
    }

    const text = document.getText(selection);
    if (!text.trim()) {
      return undefined;
    }

    // Get current model config
    const targetModel = this.config.get<ModelFamily>('tokenModel', 'auto');
    const estimate = estimateTokens(text, targetModel);

    // Calculate costs for 1,000 API calls
    // GPT-4o input: $2.50 per 1M tokens => ($2.50 / 1,000,000) * tokens * 1000 = tokens * 0.0025
    // Claude 3.5 Sonnet input: $3.00 per 1M tokens => ($3.00 / 1,000,000) * tokens * 1000 = tokens * 0.003
    const gpt4oCost = estimate.count * 0.0025;
    const claudeCost = estimate.count * 0.003;

    const formatCost = (cost: number): string => {
      if (cost === 0) { return '$0.00'; }
      if (cost < 0.0001) { return `$${cost.toFixed(6)}`; }
      if (cost < 0.01) { return `$${cost.toFixed(4)}`; }
      return `$${cost.toFixed(2)}`;
    };

    const isExactText = estimate.isExact ? 'Exact count' : `Estimated (${estimate.errorBound ?? '±~15%'})`;
    const prefix = estimate.isExact ? '' : '~';

    const hoverMarkdown = new vscode.MarkdownString();
    hoverMarkdown.isTrusted = true;
    
    hoverMarkdown.appendMarkdown(`### ✦ PromptGuide Selection Info\n\n`);
    hoverMarkdown.appendMarkdown(`* **Token Count:** **${prefix}${estimate.count}** tokens (${isExactText})\n`);
    hoverMarkdown.appendMarkdown(`* **Target Model:** ${estimate.label}\n\n`);
    hoverMarkdown.appendMarkdown(`---\n\n`);
    hoverMarkdown.appendMarkdown(`**Estimated Input Cost (for 1,000 API calls):**\n`);
    hoverMarkdown.appendMarkdown(`* **GPT-4o** ($2.50/M): \`${formatCost(gpt4oCost)}\`\n`);
    hoverMarkdown.appendMarkdown(`* **Claude 3.5 Sonnet** ($3.00/M): \`${formatCost(claudeCost)}\`\n\n`);
    hoverMarkdown.appendMarkdown(`*To configure target models or disable hovers, check PromptGuide settings.*`);

    return new vscode.Hover(hoverMarkdown, selection);
  }
}
