import * as vscode from 'vscode';
import { ModelFamily } from '../core/tokenCounter';
import { buildWebviewHtml } from './webviewUtils';
import { MessageHandler } from './messageHandler';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'promptguide.sidebarView';
  private view?: vscode.WebviewView;
  private messageHandler?: MessageHandler;

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
        vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = buildWebviewHtml(webviewView.webview, this.context.extensionPath, this.context.extensionUri);

    this.messageHandler = new MessageHandler(
      this.context,
      (msg) => this.view?.webview.postMessage(msg) ?? Promise.resolve(false),
      () => vscode.window.activeTextEditor
    );

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.messageHandler?.handleMessage(message);
    });
  }
}
