import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { optimizePrompt } from '../core/transformers';
import { estimateTokens, type ModelFamily } from '../core/tokenCounter';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptguide.sidebarView';
  private view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  public updateConfig(model: ModelFamily, budget: number): void {
    if (this.view) {
      void this.view.webview.postMessage({ type: 'config', model, budget });
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'ui'),
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this.getWebviewContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
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
            void this.view?.webview.postMessage({ type: 'optimizeResult', result });

            // Save and post version history
            const editor = vscode.window.activeTextEditor;
            if (editor) {
              const fileUri = editor.document.uri.toString();
              const history = this.saveFileHistory(fileUri, result.scoreOptimized.finalScore, result.tokensOptimized);
              void this.view?.webview.postMessage({ type: 'history', history });
            }
          } catch (err) {
            void this.view?.webview.postMessage({
              type: 'error',
              message: err instanceof Error ? err.message : 'Optimization failed',
            });
          }
          break;
        }

        case 'showDiff': {
          const original = message.original as string;
          const optimized = message.optimized as string;
          void vscode.commands.executeCommand('promptguide.showDiff', original, optimized);
          break;
        }

        case 'countTokens': {
          const text = message.text as string;
          const models: ModelFamily[] = ['gpt4', 'gpt35', 'claude', 'llama', 'auto'];
          const counts = Object.fromEntries(
            models.map(m => [m, estimateTokens(text, m)])
          );
          void this.view?.webview.postMessage({ type: 'tokenCounts', counts });
          break;
        }

        case 'applyToEditor': {
          const text = message.text as string;
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const doc = editor.document;
            const success = await editor.edit(edit => {
              const selection = editor.selection;
              if (!selection.isEmpty) {
                edit.replace(selection, text);
              } else {
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
              'PromptGuide: No active editor found to apply prompt. Copy the optimized prompt and paste manually.'
            );
          }
          break;
        }

        case 'copyToClipboard': {
          const text = message.text as string;
          await vscode.env.clipboard.writeText(text);
          void this.view?.webview.postMessage({ type: 'copied' });
          break;
        }

        case 'setModel': {
          const model = message.model as string;
          await vscode.workspace.getConfiguration('promptguide')
            .update('tokenModel', model, vscode.ConfigurationTarget.Global);
          break;
        }

        case 'setBudget': {
          const budget = message.budget as number;
          await vscode.workspace.getConfiguration('promptguide')
            .update('tokenBudget', budget, vscode.ConfigurationTarget.Global);
          break;
        }

        case 'promptCustomLimit': {
          const currentBudget = vscode.workspace.getConfiguration('promptguide').get<number>('tokenBudget', 0);
          const input = await vscode.window.showInputBox({
            title: 'PromptGuide: Set Custom Token Limit',
            prompt: 'Enter token limit (e.g. 100, 200, 10000). Enter 0 to disable.',
            value: currentBudget > 0 ? currentBudget.toString() : '',
            validateInput: (value) => {
              const num = parseInt(value, 10);
              if (value.trim() && (isNaN(num) || num < 0)) {
                return 'Must be a non-negative number';
              }
              return null;
            }
          });

          if (input !== undefined) {
            const budget = parseInt(input.trim(), 10) || 0;
            await vscode.workspace.getConfiguration('promptguide')
              .update('tokenBudget', budget, vscode.ConfigurationTarget.Global);
          } else {
            // Send original config back to restore selector state
            const model = vscode.workspace.getConfiguration('promptguide').get<ModelFamily>('tokenModel', 'auto');
            void this.view?.webview.postMessage({ type: 'config', model, budget: currentBudget });
          }
          break;
        }

        case 'ready': {
          const model = vscode.workspace.getConfiguration('promptguide')
            .get<ModelFamily>('tokenModel', 'auto');
          const budget = vscode.workspace.getConfiguration('promptguide')
            .get<number>('tokenBudget', 0);
          void this.view?.webview.postMessage({ type: 'config', model, budget });

          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const fileUri = editor.document.uri.toString();
            const history = this.getFileHistory(fileUri);
            void this.view?.webview.postMessage({ type: 'history', history });
          }
          break;
        }
      }
    });
  }

  private getHistoryFilePath(): string {
    return path.join(this.context.globalStorageUri.fsPath, 'prompt_history.json');
  }

  private getFileHistory(fileUri: string): any[] {
    const filePath = this.getHistoryFilePath();
    try {
      if (!fs.existsSync(filePath)) { return []; }
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      return data[fileUri] || [];
    } catch {
      return [];
    }
  }

  private saveFileHistory(fileUri: string, score: number, tokens: number): any[] {
    const filePath = this.getHistoryFilePath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      let data: Record<string, any[]> = {};
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(content);
      }
      const history = data[fileUri] || [];
      history.push({
        timestamp: Date.now(),
        score,
        tokens
      });
      if (history.length > 15) {
        history.shift();
      }
      data[fileUri] = history;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return history;
    } catch (err) {
      console.error('PromptGuide: Failed to save file history:', err);
      return [];
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

    const htmlPath = path.join(uiDir, 'panel.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html
      .replace(/{{CSP}}/g, csp)
      .replace(/{{NONCE}}/g, nonce)
      .replace(/{{CSS_URI}}/g, cssUri.toString())
      .replace(/{{JS_URI}}/g, jsUri.toString());

    return html;
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
