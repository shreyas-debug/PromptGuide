// ============================================================
// statusBarProvider.ts — Live token counter in VS Code status bar
// Shows estimated token count for .md, .txt, .prompt files
// Updates as user types (debounced)
// ============================================================
import * as vscode from 'vscode';
import { estimateTokens, formatTokenDisplay, formatTokenTooltip, type ModelFamily } from '../core/tokenCounter';
import { optimizePromptSync } from '../core/transformers';
import { isPromptText } from '../core/evaluator';

const SUPPORTED_EXTENSIONS = ['.md', '.txt', '.prompt'];

export class StatusBarProvider implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly config: vscode.WorkspaceConfiguration,
    private readonly extensionPath: string
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'promptguide.copyWholeFile';
    this.item.tooltip = 'PromptGuide: Click to copy the entire file to clipboard';
  }

  register(): void {
    // Check active editor on startup
    this.updateForEditor(vscode.window.activeTextEditor);

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        this.updateForEditor(editor);
      }),
      vscode.workspace.onDidChangeTextDocument(e => {
        if (vscode.window.activeTextEditor?.document === e.document) {
          this.scheduleUpdate(e.document);
        }
      }),
    );
  }

  private updateForEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.isSupported(editor.document)) {
      this.item.hide();
      return;
    }
    if (!this.config.get<boolean>('enableStatusBar', true)) {
      this.item.hide();
      return;
    }
    this.updateCount(editor.document);
  }

  private scheduleUpdate(doc: vscode.TextDocument): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.debounceTimer = setTimeout(() => {
      this.updateCount(doc);
    }, 400);
  }

  private updateCount(doc: vscode.TextDocument): void {
    if (!this.isSupported(doc)) {
      this.item.hide();
      return;
    }
    const text = doc.getText().trim();
    if (!text) {
      this.item.text = '✦ 0 tokens';
      this.item.show();
      return;
    }

    const model = this.config.get<ModelFamily>('tokenModel', 'auto');
    const budget = this.config.get<number>('tokenBudget', 0);

    // Get both original and optimized counts for comparison
    const original = estimateTokens(text, model);

    // Run sync optimizer to get the optimized count without semantic analysis
    const result = optimizePromptSync(text, this.extensionPath, model);
    const optimizedCount = result.tokensOptimized;

    // Apply budget color thresholds
    if (budget > 0) {
      const pct = (original.count / budget) * 100;
      if (pct >= 100) {
        this.item.text = `⚠️ ${original.count}/${budget} tokens`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (pct >= 80) {
        this.item.text = `⚠️ ${original.count}/${budget} tokens`;
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        this.item.text = `✦ ${original.count}/${budget} tokens`;
        this.item.backgroundColor = undefined;
      }
    } else {
      this.item.text = formatTokenDisplay(original);
      this.item.backgroundColor = undefined;
    }

    this.item.tooltip = `${formatTokenTooltip(original, optimizedCount)}\n\nClick to copy entire file to clipboard`;
    this.item.show();
  }

  private isSupported(doc: vscode.TextDocument): boolean {
    const ext = doc.uri.fsPath.slice(doc.uri.fsPath.lastIndexOf('.'));
    return SUPPORTED_EXTENSIONS.includes(ext) &&
      isPromptText(doc.getText(), doc.uri.fsPath, doc.languageId);
  }

  dispose(): void {
    this.item.dispose();
    this.disposables.forEach(d => d.dispose());
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
  }
}
