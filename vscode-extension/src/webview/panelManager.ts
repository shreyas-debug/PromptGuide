import * as vscode from 'vscode';
import { ModelFamily } from '../core/tokenCounter';
import { buildWebviewHtml } from './webviewUtils';
import { MessageHandler } from './messageHandler';

export class PanelManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  /** The text editor that was active when the panel was opened. Used for Apply to Editor. */
  private sourceEditor: vscode.TextEditor | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private messageHandler: MessageHandler;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.messageHandler = new MessageHandler(
      this.context,
      (msg) => this.panel?.webview.postMessage(msg) ?? Promise.resolve(false),
      () => this.sourceEditor ?? vscode.window.activeTextEditor
    );
  }

  /**
   * Updates configuration values sent to the webview.
   */
  public updateConfig(model: ModelFamily, budget: number): void {
    if (this.panel) {
      void this.panel.webview.postMessage({ type: 'config', model, budget });
    }
  }

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
          vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
          vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon128.png');
    this.panel.webview.html = buildWebviewHtml(this.panel.webview, this.context.extensionPath, this.context.extensionUri);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => this.messageHandler.handleMessage(message),
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

  dispose(): void {
    this.panel?.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
