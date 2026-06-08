// ============================================================
// codeLensProvider.ts — Token estimates above fenced code blocks
// Shows "PromptGuide: ~N tokens | Click to trim" above ```code``` blocks
// in Markdown files that are being used as prompts
// ============================================================
import * as vscode from 'vscode';
import { estimateTokens, type ModelFamily } from '../core/tokenCounter';
import { isPromptText } from '../core/evaluator';

export class CodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly config: vscode.WorkspaceConfiguration) { }

  register(): vscode.Disposable {
    // Only activate on markdown files
    const selector: vscode.DocumentSelector = [
      { language: 'markdown', scheme: 'file' },
      { language: 'markdown', scheme: 'untitled' },
    ];

    const registration = vscode.languages.registerCodeLensProvider(selector, this);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('promptguide')) {
          this.changeEmitter.fire();
        }
      }),
    );

    return registration;
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!this.config.get<boolean>('enableCodeLens', true)) { return []; }

    const text = document.getText();
    if (!text.trim() || !isPromptText(text, document.uri.fsPath, document.languageId)) { return []; }

    const model = this.config.get<ModelFamily>('tokenModel', 'auto');
    const startPos = new vscode.Position(0, 0);
    const estimate = estimateTokens(text, model);
    const prefix = estimate.isExact ? '' : '~';
    const lines = text.split('\n').length;

    // Estimate tokens saved by removing comments and empty lines from the entire file
    const strippedContent = text
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*') &&
          trimmed !== '*/';
      })
      .join('\n');
    const strippedEstimate = estimateTokens(strippedContent, model);
    const savings = estimate.count - strippedEstimate.count;

    const lens = new vscode.CodeLens(
      new vscode.Range(startPos, startPos),
      {
        title: savings > 0
          ? `PromptGuide ✦ ${prefix}${estimate.count} tokens  ·  Strip comments → −${savings} tokens  ·  ${lines} lines`
          : `PromptGuide ✦ ${prefix}${estimate.count} tokens  ·  ${lines} lines`,
        command: 'promptguide.quickRefineCodeBlock',
        tooltip: `Click for quick-refine options (apply/copy/details) — no window needed.`,
        arguments: [text, 0, text.length],
      }
    );

    return [lens];
  }

  dispose(): void {
    this.changeEmitter.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
