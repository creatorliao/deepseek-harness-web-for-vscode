// Command wiring for the extension lifecycle (T3).
// Four commands; the two "open" commands address an explicit surface, while
// `start` uses the configured default (see openTarget.ts).
import * as os from "node:os";
import * as vscode from "vscode";
import { DshServerManager } from "./serverManager.js";
import { t } from "./i18n.js";

/** The first workspace folder, or the OS home when no folder is open. */
export function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

/**
 * User-configured dsh executable (`deepseekHarness.dshPath`), or undefined to
 * auto-detect. Blank/whitespace counts as "not configured" so clearing the
 * setting restores auto-detection instead of trying to spawn "".
 */
export function configuredDshPath(): string | undefined {
  const value = vscode.workspace.getConfiguration("deepseekHarness").get<string>("dshPath");
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Start options shared by EVERY start path (command, launcher, status bar,
 * overlay buttons, reload auto-restart). Keeping them in one place means the
 * configured binary cannot be honoured on some paths and ignored on others.
 */
export function dshStartOptions(): { cwd: string; dshBin?: string } {
  const dshBin = configuredDshPath();
  return { cwd: workspaceRoot(), ...(dshBin ? { dshBin } : {}) };
}

export interface CommandTargets {
  /** Open in whichever surface `deepseekHarness.openTarget` selects. */
  openDefault: () => void;
  /** Always the editor-tab panel (multi-session side-by-side work). */
  openEditorTab: () => void;
  /** Always the secondary-side-bar view. */
  openChatView: () => void;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  manager: DshServerManager,
  targets: CommandTargets
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("deepseek-harness-for-vscode.start", async () => {
      try {
        const url = await manager.start(dshStartOptions());
        targets.openDefault();
        vscode.window.showInformationMessage(`DeepSeek Harness ready at ${url}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(t("command.startFailed", { message: msg }));
      }
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.stop", async () => {
      manager.stop();
      vscode.window.showInformationMessage("DeepSeek Harness stopped.");
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openBrowser", async () => {
      // dsh 0.1.2+ needs the launch token in the URL for a real browser to
      // mint its session cookie; the bare server URL would 401.
      const url = manager.browserUrl ?? manager.serverUrl;
      if (!url) {
        vscode.window.showWarningMessage(t("command.notRunning"));
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openChatView", () => {
      targets.openChatView();
    }),
    vscode.commands.registerCommand("deepseek-harness-for-vscode.openPanel", () => {
      targets.openEditorTab();
    })
  );
}
