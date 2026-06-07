// ============================================================
// panelManager.ts — Manages the PromptGuide Webview Panel lifecycle
// ============================================================
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { optimizePrompt } from '../core/transformers';
import { estimateTokens, type ModelFamily } from '../core/tokenCounter';

export class PanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  /** The text editor that was active when the panel was opened. Used for Apply to Editor. */
  private sourceEditor: vscode.TextEditor | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) { }

  /**
   * Opens the optimizer panel with the given initial text.
   */
  openPanel(initialText?: string): void {
    // Capture the source editor BEFORE the panel steals focus.
    // activeTextEditor becomes undefined once the webview panel is shown beside.
    this.sourceEditor = vscode.window.activeTextEditor ?? this.sourceEditor;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      if (initialText) {
        void this.panel.webview.postMessage({ type: 'loadText', text: initialText });
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'promptguide',
      'PromptGuide Optimizer',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'ui'),
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon128.png');
    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => this.handleMessage(message),
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, this.disposables);

    // Send initial text if provided
    if (initialText) {
      // Slight delay to allow webview to initialize
      setTimeout(() => {
        void this.panel?.webview.postMessage({ type: 'loadText', text: initialText });
      }, 300);
    }
  }

  private async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
    switch (message.type) {
      case 'optimize': {
        const text = message.text as string;
        const model = vscode.workspace.getConfiguration('promptguide')
          .get<ModelFamily>('tokenModel', 'auto');

        try {
          const result = await optimizePrompt(
            text,
            this.context.extensionPath,
            this.context.globalStorageUri.fsPath,
            model
          );
          void this.panel?.webview.postMessage({ type: 'optimizeResult', result });
        } catch (err) {
          void this.panel?.webview.postMessage({
            type: 'error',
            message: err instanceof Error ? err.message : 'Optimization failed',
          });
        }
        break;
      }

      case 'countTokens': {
        const text = message.text as string;
        const models: ModelFamily[] = ['gpt4', 'gpt35', 'claude', 'llama', 'auto'];
        const counts = Object.fromEntries(
          models.map(m => [m, estimateTokens(text, m)])
        );
        void this.panel?.webview.postMessage({ type: 'tokenCounts', counts });
        break;
      }

      case 'applyToEditor': {
        const text = message.text as string;
        // Prefer the stored source editor (captured before the webview stole focus).
        // Fall back to activeTextEditor in case the user moved focus back manually.
        const editor = this.sourceEditor ?? vscode.window.activeTextEditor;
        if (editor) {
          const doc = editor.document;
          const success = await editor.edit(edit => {
            const selection = editor.selection;
            if (!selection.isEmpty) {
              edit.replace(selection, text);
            } else {
              // Replace the entire document — use correct last line + last column
              const lastLine = doc.lineAt(doc.lineCount - 1);
              edit.replace(
                new vscode.Range(0, 0, lastLine.lineNumber, lastLine.text.length),
                text
              );
            }
          });
          if (success) {
            vscode.window.showInformationMessage('PromptGuide: Optimized prompt applied to editor ✅');
          } else {
            vscode.window.showWarningMessage('PromptGuide: Could not apply — the document may be read-only.');
          }
        } else {
          vscode.window.showWarningMessage(
            'PromptGuide: No source editor found. Copy the optimized prompt and paste it manually.'
          );
        }
        break;
      }

      case 'copyToClipboard': {
        const text = message.text as string;
        await vscode.env.clipboard.writeText(text);
        void this.panel?.webview.postMessage({ type: 'copied' });
        break;
      }

      case 'setModel': {
        const model = message.model as string;
        await vscode.workspace.getConfiguration('promptguide')
          .update('tokenModel', model, vscode.ConfigurationTarget.Global);
        break;
      }

      case 'ready': {
        // Webview has finished loading — send current model setting
        const model = vscode.workspace.getConfiguration('promptguide')
          .get<ModelFamily>('tokenModel', 'auto');
        void this.panel?.webview.postMessage({ type: 'config', model });
        break;
      }
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const uiDir = path.join(this.context.extensionPath, 'src', 'webview', 'ui');

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'ui', 'panel.css')
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'ui', 'panel.js')
    );

    const nonce = getNonce();
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

    // Read the HTML template and inject URIs + CSP
    const htmlPath = path.join(uiDir, 'panel.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html
      .replace(/{{CSP}}/g, csp)
      .replace(/{{NONCE}}/g, nonce)
      .replace(/{{CSS_URI}}/g, cssUri.toString())
      .replace(/{{JS_URI}}/g, jsUri.toString());

    return html;
  }

  dispose(): void {
    this.panel?.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
