import * as vscode from 'vscode';
import { optimizePrompt } from '../core/transformers';
import { estimateTokens, type ModelFamily } from '../core/tokenCounter';
import { HistoryStore } from '../core/historyStore';

export class MessageHandler {
  private historyStore: HistoryStore;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly postMessage: (message: any) => Thenable<boolean>,
    private readonly getSourceEditor: () => vscode.TextEditor | undefined
  ) {
    this.historyStore = new HistoryStore(context.globalStorageUri.fsPath);
  }

  public async handleMessage(message: { type: string; [key: string]: unknown }): Promise<void> {
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
          void this.postMessage({ type: 'optimizeResult', result });

          // Save and post version history
          const editor = this.getSourceEditor();
          if (editor) {
            const fileUri = editor.document.uri.toString();
            const history = this.historyStore.saveFileHistory(fileUri, result.scoreOptimized.finalScore, result.tokensOptimized);
            void this.postMessage({ type: 'history', history });
          }
        } catch (err) {
          void this.postMessage({
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
        void this.postMessage({ type: 'tokenCounts', counts });
        break;
      }

      case 'applyToEditor': {
        const text = message.text as string;
        const editor = this.getSourceEditor();
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
        void this.postMessage({ type: 'copied' });
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

      case 'toggleDiagnostics': {
        const enable = message.enable as boolean;
        await vscode.workspace.getConfiguration('promptguide')
          .update('enableDiagnostics', enable, vscode.ConfigurationTarget.Global);
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
          const model = vscode.workspace.getConfiguration('promptguide').get<ModelFamily>('tokenModel', 'auto');
          void this.postMessage({ type: 'config', model, budget: currentBudget });
        }
        break;
      }

      case 'ready': {
        const config = vscode.workspace.getConfiguration('promptguide');
        const model = config.get<ModelFamily>('tokenModel', 'auto');
        const budget = config.get<number>('tokenBudget', 0);
        const enableDiagnostics = config.get<boolean>('enableDiagnostics', true);

        void this.postMessage({ type: 'config', model, budget, enableDiagnostics });

        const editor = this.getSourceEditor();
        if (editor) {
          const fileUri = editor.document.uri.toString();
          const history = this.historyStore.getFileHistory(fileUri);
          void this.postMessage({ type: 'history', history });
        }
        break;
      }
    }
  }
}
