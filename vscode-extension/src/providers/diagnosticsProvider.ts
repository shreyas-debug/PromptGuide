// ============================================================
// diagnosticsProvider.ts — Inline prompt linting
// Shows squiggly underlines in .md, .txt, .prompt files
// Uses the evaluator (compromise POS) for accurate detection
// ============================================================
import * as vscode from 'vscode';
import { runFullEvaluation } from '../core/evaluator';

const SUPPORTED_LANGUAGES = ['markdown', 'plaintext', 'prompt'];

export class DiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly config: vscode.WorkspaceConfiguration) {
    this.collection = vscode.languages.createDiagnosticCollection('promptguide');
  }

  register(): void {
    // Run on currently open editors
    vscode.window.visibleTextEditors.forEach(e => this.scheduleAnalysis(e.document));

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (this.isSupported(e.document)) {
          this.scheduleAnalysis(e.document);
        }
      }),
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (this.isSupported(doc)) { this.scheduleAnalysis(doc); }
      }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.collection.delete(doc.uri);
        const key = doc.uri.toString();
        const timer = this.debounceTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.debounceTimers.delete(key);
        }
      }),
    );
  }

  private isSupported(doc: vscode.TextDocument): boolean {
    return SUPPORTED_LANGUAGES.includes(doc.languageId) &&
      this.config.get<boolean>('enableDiagnostics', true);
  }

  private scheduleAnalysis(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) { clearTimeout(existing); }

    const delay = this.config.get<number>('diagnosticsDelay', 600);
    const timer = setTimeout(() => {
      this.analyzeDocument(doc);
      this.debounceTimers.delete(key);
    }, delay);

    this.debounceTimers.set(key, timer);
  }

  private analyzeDocument(doc: vscode.TextDocument): void {
    const text = doc.getText().trim();

    // Skip empty files or very short texts (< 10 chars)
    if (text.length < 10) {
      this.collection.set(doc.uri, []);
      return;
    }

    // For markdown files, extract only non-code-block text for evaluation
    const promptText = doc.languageId === 'markdown'
      ? this.extractNonCodeText(text)
      : text;

    // Respect the suppress comment — user opted out of all diagnostics for this file
    if (text.includes('<!-- promptguide-disable -->')) {
      this.collection.set(doc.uri, []);
      return;
    }

    if (!promptText || promptText.trim().length < 10) {
      this.collection.set(doc.uri, []);
      return;
    }

    const evaluation = runFullEvaluation(promptText);
    const diagnostics: vscode.Diagnostic[] = [];

    // Diagnostics are reported at the very first line only.
    // Evaluation is holistic (not per-line), so we do NOT span the whole
    // document — that would underline every line in the file.
    const firstLineLen = doc.lineAt(0).text.length;
    const fullRange = new vscode.Range(0, 0, 0, firstLineLen);

    // --- Actionability diagnostic ---
    if (evaluation.breakdown.Actionability === 0) {
      const diag = new vscode.Diagnostic(
        fullRange,
        "PromptGuide: No action verb detected. Start with 'Explain', 'Generate', 'Summarize', or 'Analyze' to state your goal clearly.",
        vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'PromptGuide';
      diag.code = 'PG001';
      diagnostics.push(diag);
    }

    // --- Specificity diagnostic ---
    if (evaluation.breakdown.Specificity === 0) {
      const diag = new vscode.Diagnostic(
        fullRange,
        "PromptGuide: No output constraint detected. Add 'in JSON format', 'as a numbered list', or 'step by step' to guide the AI response.",
        vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'PromptGuide';
      diag.code = 'PG002';
      diagnostics.push(diag);
    }

    // --- Verbosity diagnostic (information only) ---
    const fillerPatterns = [
      /\bin order to\b/i, /\bdue to the fact that\b/i, /\bi would like you to\b/i,
      /\bplease note that\b/i, /\bas you may know\b/i, /\bfeel free to\b/i,
      /\bwith that being said\b/i, /\bneedless to say\b/i,
    ];
    const fillerCount = fillerPatterns.filter(re => re.test(promptText)).length;
    if (fillerCount >= 2) {
      const diag = new vscode.Diagnostic(
        fullRange,
        `PromptGuide: ${fillerCount} verbose filler phrases detected (e.g., 'in order to', 'please note that'). These cost extra tokens. Use PromptGuide: Evaluate & Optimize to compress.`,
        vscode.DiagnosticSeverity.Information
      );
      diag.source = 'PromptGuide';
      diag.code = 'PG003';
      diagnostics.push(diag);
    }

    // --- Role diagnostic (hint) ---
    const hasRole = /\byou are (a|an|the)\b/i.test(promptText) ||
      /\bact as (a|an|the)\b/i.test(promptText) ||
      /\bas (a|an|the) [a-z]/i.test(promptText);
    if (!hasRole && promptText.split(/\s+/).length > 15) {
      const diag = new vscode.Diagnostic(
        fullRange,
        "PromptGuide: No role context assigned. Adding 'You are a [role]' at the start improves AI response consistency.",
        vscode.DiagnosticSeverity.Hint
      );
      diag.source = 'PromptGuide';
      diag.code = 'PG004';
      diagnostics.push(diag);
    }

    this.collection.set(doc.uri, diagnostics);
  }

  private extractNonCodeText(markdown: string): string {
    // Remove fenced code blocks from markdown before evaluation
    return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '').trim();
  }

  dispose(): void {
    this.collection.dispose();
    this.disposables.forEach(d => d.dispose());
    this.debounceTimers.forEach(t => clearTimeout(t));
    this.debounceTimers.clear();
  }
}
