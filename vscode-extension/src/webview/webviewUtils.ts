import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function buildWebviewHtml(webview: vscode.Webview, extensionPath: string, extensionUri: vscode.Uri): string {
  // Assets live in the top-level `webview/` folder so they are unconditionally
  // included in the published .vsix — `src/**` is excluded by .vscodeignore
  // and the negation `!src/webview/ui/**` is unreliable with some vsce versions.
  const uiDir = path.join(extensionPath, 'webview');

  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview', 'panel.css')
  );
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'webview', 'panel.js')
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
