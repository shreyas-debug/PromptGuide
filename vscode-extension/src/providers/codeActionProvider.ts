// ============================================================
// codeActionProvider.ts — PromptGuide Quick Fix actions
// Registers code actions that appear in the VS Code lightbulb
// menu for each PromptGuide diagnostic (PG001–PG004).
// All fixes are instant (no LLM, no async) and apply in-place.
// ============================================================
import * as vscode from 'vscode';
import { compressVerbosity } from '../core/transformers/verbosityCompressor';

// Diagnostic codes we produce in diagnosticsProvider.ts
const PG_CODES = new Set(['PG001', 'PG002', 'PG003', 'PG004']);

// Quick fixes that add text are small and deterministic
const CONSTRAINT_SUFFIX = '\n\nFormat the response as a numbered list.';
const ROLE_PREFIX = 'You are a helpful, precise assistant.\n\n';
const VERB_PREFIX = 'Explain: ';

export class PromptGuideCodeActionProvider
  implements vscode.CodeActionProvider, vscode.Disposable
{
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
  ];

  constructor(private readonly extensionPath: string) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    // Only act on our own diagnostics
    const ourDiagnostics = context.diagnostics.filter(
      d =>
        d.source === 'PromptGuide' &&
        typeof d.code === 'string' &&
        PG_CODES.has(d.code as string)
    );

    if (ourDiagnostics.length === 0) { return []; }

    const actions: vscode.CodeAction[] = [];
    const fullText = document.getText();

    for (const diag of ourDiagnostics) {
      const code = diag.code as string;

      if (code === 'PG003') {
        actions.push(this.makeStripFillerAction(document, fullText, diag));
      }
      if (code === 'PG002') {
        actions.push(this.makeAddConstraintAction(document, fullText, diag));
      }
      if (code === 'PG001') {
        actions.push(this.makeAddVerbAction(document, fullText, diag));
      }
      if (code === 'PG004') {
        actions.push(this.makeAddRoleAction(document, fullText, diag));
      }
    }

    // Common actions — added ONCE regardless of how many diagnostics are active.
    const anchor = ourDiagnostics[0];
    actions.push(this.makeOpenOptimizerAction(anchor));
    actions.push(this.makeSuppressAction(document, anchor));

    return actions;
  }

  // ── PG003: Strip filler phrases ────────────────────────────────────────
  private makeStripFillerAction(
    document: vscode.TextDocument,
    fullText: string,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'PromptGuide: Strip filler phrases (save tokens)',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];
    action.isPreferred = true; // shown bold / first

    const compressed = compressVerbosity(fullText, this.extensionPath, []);
    if (compressed !== fullText) {
      const edit = new vscode.WorkspaceEdit();
      const lastLine = document.lineAt(document.lineCount - 1);
      edit.replace(
        document.uri,
        new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
        compressed
      );
      action.edit = edit;
    } else {
      // Nothing to strip — open the optimizer instead
      action.command = {
        command: 'promptguide.evaluateFile',
        title: 'Open PromptGuide Optimizer',
      };
    }

    return action;
  }

  // ── PG002: Add output constraint ───────────────────────────────────────
  private makeAddConstraintAction(
    document: vscode.TextDocument,
    fullText: string,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'PromptGuide: Add output format constraint',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];

    const newText = fullText.trimEnd() + CONSTRAINT_SUFFIX;
    const edit = new vscode.WorkspaceEdit();
    const lastLine = document.lineAt(document.lineCount - 1);
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
      newText
    );
    action.edit = edit;
    return action;
  }

  // ── PG001: Add action verb ─────────────────────────────────────────────
  private makeAddVerbAction(
    document: vscode.TextDocument,
    fullText: string,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      "PromptGuide: Prepend action verb ('Explain: …')",
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];

    const newText = VERB_PREFIX + fullText.trimStart();
    const edit = new vscode.WorkspaceEdit();
    const lastLine = document.lineAt(document.lineCount - 1);
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
      newText
    );
    action.edit = edit;
    return action;
  }

  // ── PG004: Add role context ────────────────────────────────────────────
  private makeAddRoleAction(
    document: vscode.TextDocument,
    fullText: string,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      "PromptGuide: Add role context ('You are a helpful assistant…')",
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];

    const newText = ROLE_PREFIX + fullText.trimStart();
    const edit = new vscode.WorkspaceEdit();
    const lastLine = document.lineAt(document.lineCount - 1);
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
      newText
    );
    action.edit = edit;
    return action;
  }

  // ── Open full optimizer ────────────────────────────────────────────────
  private makeOpenOptimizerAction(diag: vscode.Diagnostic): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'PromptGuide: Open full optimizer…',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];
    action.command = {
      command: 'promptguide.evaluateFile',
      title: 'Open PromptGuide Optimizer',
    };
    return action;
  }

  // ── Suppress this warning ──────────────────────────────────────────────
  private makeSuppressAction(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'PromptGuide: Suppress this warning',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];

    // Insert a disable comment on the line before the diagnostic
    const edit = new vscode.WorkspaceEdit();
    const insertPos = new vscode.Position(diag.range.start.line, 0);
    edit.insert(document.uri, insertPos, '<!-- promptguide-disable -->\n');
    action.edit = edit;
    return action;
  }

  dispose(): void { /* nothing to clean up */ }
}
