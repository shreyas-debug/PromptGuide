// ============================================================
// extension.ts — VS Code Extension Activation Entry Point
// Registers all providers, commands, and the chat participant
// ============================================================
import * as vscode from 'vscode';
import { DiagnosticsProvider } from './providers/diagnosticsProvider';
import { StatusBarProvider } from './providers/statusBarProvider';
import { CodeLensProvider } from './providers/codeLensProvider';
import { PromptGuideCodeActionProvider } from './providers/codeActionProvider';
import { PromptHoverProvider } from './providers/hoverProvider';
import { PanelManager } from './webview/panelManager';
import { SidebarViewProvider } from './webview/sidebarProvider';
import { registerChatParticipant } from './chat/chatParticipant';
import { optimizePromptSync, clearRulesCache } from './core/transformers';
import { estimateTokens, type ModelFamily } from './core/tokenCounter';

class PromptDiffProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = 'promptguide-diff';
  private contents = new Map<string, string>();

  public provideTextDocumentContent(uri: vscode.Uri): string {
    const queryParams = new URLSearchParams(uri.query);
    const id = queryParams.get('id') || '';
    return this.contents.get(id) ?? '';
  }

  public registerContent(original: string, optimized: string): { originalUri: vscode.Uri, optimizedUri: vscode.Uri } {
    const id = Math.random().toString(36).substring(2, 11);
    const originalKey = `original-${id}`;
    const optimizedKey = `optimized-${id}`;
    this.contents.set(originalKey, original);
    this.contents.set(optimizedKey, optimized);

    return {
      originalUri: vscode.Uri.parse(`${PromptDiffProvider.scheme}:Original?id=${originalKey}`),
      optimizedUri: vscode.Uri.parse(`${PromptDiffProvider.scheme}:Optimized?id=${optimizedKey}`)
    };
  }
}

const SUPPORTED_LANGS: vscode.DocumentSelector = [
  { language: 'markdown', scheme: 'file' },
  { language: 'markdown', scheme: 'untitled' },
  { language: 'plaintext', scheme: 'file' },
  { language: 'plaintext', scheme: 'untitled' },
  { language: 'prompt', scheme: 'file' },
  { language: 'prompt', scheme: 'untitled' },
];

export function activate(context: vscode.ExtensionContext): void {
  // Clear any cached rules to prevent stale paths on reload/restart
  clearRulesCache();

  // Diff Content Provider & Command
  const diffProvider = new PromptDiffProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PromptDiffProvider.scheme, diffProvider),
    vscode.commands.registerCommand('promptguide.showDiff', (original: string, optimized: string) => {
      const { originalUri, optimizedUri } = diffProvider.registerContent(original, optimized);
      void vscode.commands.executeCommand('vscode.diff', originalUri, optimizedUri, 'Original ↔ Optimized Prompt');
    })
  );

  const config = vscode.workspace.getConfiguration('promptguide');
  const panelManager = new PanelManager(context);
  const sidebarProvider = new SidebarViewProvider(context);

  // ── 1. Inline Diagnostics Provider ──────────────────────────────────
  const diagnosticsProvider = new DiagnosticsProvider(config);
  diagnosticsProvider.register();
  context.subscriptions.push(diagnosticsProvider);

  // ── 2. Status Bar Token Counter ──────────────────────────────────────
  const statusBarProvider = new StatusBarProvider(config, context.extensionPath);
  statusBarProvider.register();
  context.subscriptions.push(statusBarProvider);

  // ── 3. CodeLens Token Estimator (Markdown code blocks) ───────────────
  const codeLensProvider = new CodeLensProvider(config);
  const codeLensDisposable = codeLensProvider.register();
  context.subscriptions.push(codeLensDisposable, codeLensProvider);

  // ── 3.5. Selection Hover Token Counter ─────────────────────────────────
  const hoverProvider = new PromptHoverProvider(config);
  const hoverDisposable = vscode.languages.registerHoverProvider(SUPPORTED_LANGS, hoverProvider);
  context.subscriptions.push(hoverDisposable);

  // ── 4. Quick Fix / Code Action Provider ──────────────────────────────
  const codeActionProvider = new PromptGuideCodeActionProvider(context.extensionPath);
  const codeActionDisposable = vscode.languages.registerCodeActionsProvider(
    [
      { language: 'markdown', scheme: 'file' },
      { language: 'markdown', scheme: 'untitled' },
      { language: 'plaintext', scheme: 'file' },
      { language: 'plaintext', scheme: 'untitled' },
      { language: 'prompt', scheme: 'file' },
      { language: 'prompt', scheme: 'untitled' },
    ],
    codeActionProvider,
    { providedCodeActionKinds: PromptGuideCodeActionProvider.providedCodeActionKinds }
  );
  context.subscriptions.push(codeActionDisposable, codeActionProvider);

  // ── 5. Chat Participant (@promptguide) ────────────────────────────────
  // Requires: VS Code 1.90+ AND GitHub Copilot Chat extension installed & signed in.
  // The 'chat' namespace is only present when Copilot Chat is active.
  if ('chat' in (vscode as any)) {
    try {
      const chatParticipant = registerChatParticipant(context);
      context.subscriptions.push(chatParticipant);
      console.log('PromptGuide: @promptguide chat participant registered ✅');
    } catch (err) {
      console.error('PromptGuide: Failed to register chat participant:', err);
    }
  } else {
    console.warn(
      'PromptGuide: vscode.chat API not available. ' +
      '@promptguide will not appear in chat. ' +
      'Make sure GitHub Copilot Chat is installed and you are signed in.'
    );
    // Show a friendly one-time notification to install GitHub Copilot Chat
    const warningKey = 'promptguide.copilotWarningShown';
    if (!context.globalState.get<boolean>(warningKey, false)) {
      void context.globalState.update(warningKey, true);
      void vscode.window.showInformationMessage(
        'PromptGuide: The @promptguide chat participant is unavailable because GitHub Copilot Chat is not installed or active.',
        'Install Copilot Chat'
      ).then((selection: string | undefined) => {
        if (selection === 'Install Copilot Chat') {
          void vscode.commands.executeCommand('workbench.extensions.installExtension', 'github.copilot-chat');
        }
      });
    }
  }

  // ── 6. Commands ───────────────────────────────────────────────────────

  // Evaluate & Optimize — selection or full file
  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.evaluateSelection', async (passedText?: string) => {
      const editor = vscode.window.activeTextEditor;
      let text: string | undefined = passedText;

      if (!text && editor) {
        const selection = editor.selection;
        text = !selection.isEmpty
          ? editor.document.getText(selection)
          : editor.document.getText();
      }

      if (!text?.trim()) {
        vscode.window.showWarningMessage('PromptGuide: No text to evaluate. Select text or open a .md/.txt/.prompt file.');
        return;
      }

      panelManager.openPanel(text.trim());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.evaluateFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('PromptGuide: No active editor.');
        return;
      }
      const text = editor.document.getText();
      if (!text.trim()) {
        vscode.window.showWarningMessage('PromptGuide: File is empty.');
        return;
      }
      panelManager.openPanel(text.trim());
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.openPanel', () => {
      panelManager.openPanel();
    })
  );

  // Set token model via quick pick
  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.setTokenModel', async () => {
      const choice = await vscode.window.showQuickPick([
        { label: '$(symbol-misc) Auto (universal estimate ±15%)', value: 'auto', description: 'Best for unknown or multiple models' },
        { label: '$(symbol-misc) GPT-4 / GPT-4o', value: 'gpt4', description: 'Exact count using cl100k_base tokenizer' },
        { label: '$(symbol-misc) GPT-3.5-turbo', value: 'gpt35', description: 'Exact count using cl100k_base tokenizer' },
        { label: '$(symbol-misc) Claude (Anthropic)', value: 'claude', description: 'Approximation ±5%' },
        { label: '$(symbol-misc) Llama / Mistral / Gemma', value: 'llama', description: 'Approximation ±10%' },
      ], {
        title: 'PromptGuide: Select Your Target AI Model',
        placeHolder: 'Choose the AI model you are writing prompts for',
      });

      if (choice) {
        await vscode.workspace.getConfiguration('promptguide')
          .update('tokenModel', choice.value, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`PromptGuide: Token model set to "${choice.label.replace(/^\$\([^)]+\) /, '')}"`);
      }
    })
  );

  // Copy-to-chat command (invoked by chat participant button)
  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.copyToChat', async (text: string) => {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('PromptGuide: Optimized prompt copied to clipboard ✅');
    })
  );

  // Open-from-file command (invoked by status bar click)
  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.openFromFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('PromptGuide: No active editor.');
        return;
      }
      const text = editor.document.getText();
      panelManager.openPanel(text.trim());
    })
  );

  // Deprecated alias for openFromFile to avoid breaking existing user keybindings
  context.subscriptions.push(
    vscode.commands.registerCommand('promptguide.copyWholeFile', async () => {
      void vscode.commands.executeCommand('promptguide.openFromFile');
    })
  );


  // Quick-refine code block (invoked by CodeLens click — lightweight popup, no panel)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'promptguide.quickRefineCodeBlock',
      async (blockContent: string, startOffset: number, endOffset: number) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return; }

        const model = vscode.workspace.getConfiguration('promptguide')
          .get<ModelFamily>('tokenModel', 'auto');

        // Run SYNC compression only (no quality-adding injectors, no panel)
        const result = optimizePromptSync(blockContent, context.extensionPath, model);
        const saved = result.tokensOriginal - result.tokensOptimized;
        const changed = result.optimized !== result.original;

        const prefix = estimateTokens(blockContent, model).isExact ? '' : '~';
        const header = changed
          ? `PromptGuide: ${prefix}${result.tokensOriginal} → ${prefix}${result.tokensOptimized} tokens  (−${saved} saved)`
          : `PromptGuide: No compressions found in this block (${prefix}${result.tokensOriginal} tokens)`;

        // Build action buttons based on whether there is anything to apply
        const applyBtn = changed ? 'Apply Compression' : undefined;
        const copyBtn = 'Copy Optimized';
        const detailBtn = 'See Details';

        const buttons = [applyBtn, copyBtn, detailBtn].filter(Boolean) as string[];

        const choice = await vscode.window.showInformationMessage(header, ...buttons);

        if (choice === 'Apply Compression') {
          // Replace the code-block range inside the document
          const startPos = editor.document.positionAt(startOffset);
          const endPos = editor.document.positionAt(endOffset);
          const isWholeFile = (startOffset === 0 && endOffset === editor.document.getText().length);
          await editor.edit(edit => {
            const replacement = isWholeFile ? result.optimized : `\`\`\`\n${result.optimized}\n\`\`\``;
            edit.replace(new vscode.Range(startPos, endPos), replacement);
          });
          vscode.window.showInformationMessage(`PromptGuide: Applied — saved ~${saved} tokens ✅`);
        } else if (choice === 'Copy Optimized') {
          await vscode.env.clipboard.writeText(result.optimized);
          vscode.window.showInformationMessage('PromptGuide: Optimized block copied to clipboard ✅');
        } else if (choice === 'See Details') {
          panelManager.openPanel(blockContent);
        }
      }
    )
  );

  // ── 7. Configuration change listener ─────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('promptguide')) {
        const newConfig = vscode.workspace.getConfiguration('promptguide');
        const model = newConfig.get<ModelFamily>('tokenModel', 'auto');
        const budget = newConfig.get<number>('tokenBudget', 0);
        
        panelManager.updateConfig(model, budget);
        sidebarProvider.updateConfig(model, budget);
      }
    })
  );

  // ── 8. Webview Sidebar View Provider ──────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.viewType,
      sidebarProvider
    )
  );

  // ── 9. Panel manager disposal ─────────────────────────────────────────
  context.subscriptions.push(panelManager);

  console.log('PromptGuide extension activated ✅');
}

export function deactivate(): void {
  console.log('PromptGuide extension deactivated.');
}
