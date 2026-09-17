// DeepSeek Harness in the SECONDARY SIDE BAR (Q5 "always on the right").
//
// Why a view and not an editor tab: a view contributed under
// `viewsContainers.secondarySidebar` is structurally pinned opposite the
// primary side bar — VS Code guarantees the position, the user cannot drag it
// into the editor area, and it never steals the editor tab.
//
// It reuses the same three pieces as the editor panel: documentAssembly (fetch
// + rewrite + inject), BridgeHost (http/ws/clipboard relay) and the shared
// chrome in dshUi.ts. A WebviewView exposes a `vscode.Webview` exactly like a
// WebviewPanel, so the bridge needs no changes at all.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DshServerManager, type ServerInfo } from "./serverManager.js";
import { assembleDocument } from "./documentAssembly.js";
import { BridgeHost } from "./bridgeHost.js";
import { dshStartOptions, workspaceRoot } from "./commands.js";
import { FOCUS_CHAT_VIEW_COMMAND, FOCUS_CHAT_VIEW_ITEM_COMMAND } from "./openTarget.js";
import {
  distRootPath,
  isDarkTheme,
  placeholderHtml,
  statusChromeHtml,
  deliverDropToComposer,
  handleInsertResult,
} from "./dshUi.js";
import { t } from "./i18n.js";

export class DshChatView implements vscode.WebviewViewProvider {
  /** View id contributed under the `deepseek-harness-chat` container. */
  public static readonly viewType = "deepseek-harness.chatView";

  private view?: vscode.WebviewView;
  private bridge?: BridgeHost;
  /** Session bound to this view; undefined = follow `dsh.sessions.current`. */
  private sessionId?: string;
  private pendingPreset?: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager
  ) {
    // Only mirror state into the overlay: assembly is driven by the extension
    // AFTER theme sync, so the page loads with the right color scheme.
    manager.on("state", (info: ServerInfo) => {
      this.postStatus(info);
    });
    // Live theme switch without a page reload — the embedded client resolves
    // "system" through the matchMedia shim, which this message updates.
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme((e) => {
        const dark =
          e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast;
        this.view?.webview.postMessage({ type: "theme-preference", dark });
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    console.log(`[dsh] resolve chat view: managerState=${this.manager.state}`);
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(distRootPath(this.context))],
    };
    this.bridge = new BridgeHost(
      webviewView.webview,
      () => this.manager.serverUrl ?? "",
      () => this.manager.authCookieHeader
    );

    webviewView.webview.onDidReceiveMessage((msg) => {
      const m = msg as { type?: string; payload?: unknown; ok?: unknown; text?: unknown };
      if (m.type === "start") {
        void this.manager.start(dshStartOptions()).catch(() => {
          /* state machine drives the overlay */
        });
      } else if (m.type === "stop") {
        this.manager.stop();
      } else if (m.type === "dsh-context-drop") {
        void deliverDropToComposer(webviewView.webview, m.payload, workspaceRoot());
      } else if (m.type === "dsh-context-insert-result") {
        handleInsertResult(m);
      }
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
      this.bridge?.dispose();
      this.bridge = undefined;
    });

    webviewView.webview.html = placeholderHtml();
    this.postStatus({ state: this.manager.state, url: this.manager.serverUrl });
    if (this.manager.state === "ready") void this.refresh();
  }

  /** Session this view is currently bound to (undefined = unbound). */
  get boundSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Whether the view is showing in the UI (target picking for the context menu). */
  get isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  /**
   * Post one message to this view's webview. Used by the explorer context-menu
   * entry, which has no webview message of its own to reply to.
   */
  postMessage(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }

  /**
   * Bind the view to `sessionId` (when given) and apply the localStorage preset,
   * WITHOUT revealing it. Used on every ready cycle so the view is already
   * correct whenever the user looks at it — revealing on a background restart
   * would steal focus.
   */
  async setSession(sessionId?: string, preset?: string): Promise<void> {
    if (sessionId !== undefined) this.sessionId = sessionId;
    if (preset !== undefined) this.pendingPreset = preset;
    if (this.view && this.manager.state === "ready") await this.refresh();
  }

  /**
   * Bind the view and reveal it. Returns **false** when the side-bar route did
   * not produce a live view (focus command unavailable, or the view never
   * resolved) so the caller can fall back to the editor tab. The DSH UI is
   * where the Composer lives — a silent no-op would leave the user with no way
   * to type.
   */
  async show(sessionId?: string, preset?: string): Promise<boolean> {
    await this.setSession(sessionId, preset);
    // Two shots at revealing it: the container command is authoritative for a
    // contributed container, and the view-level command covers hosts (or moved
    // views) where the container route does not resolve.
    for (const command of [FOCUS_CHAT_VIEW_COMMAND, FOCUS_CHAT_VIEW_ITEM_COMMAND]) {
      try {
        await vscode.commands.executeCommand(command);
      } catch (err) {
        console.log(
          `[dsh] ${command} failed:`,
          err instanceof Error ? err.message : err
        );
      }
      if (this.view) return true;
      await new Promise((r) => setTimeout(r, 350));
    }
    return this.view !== undefined;
  }

  /** Re-assemble the document from the running server (no-op when not ready). */
  private async refresh(): Promise<void> {
    const url = this.manager.serverUrl;
    if (!url || !this.view) return;
    try {
      const bridgeJs = fs.readFileSync(
        path.join(this.context.extensionUri.fsPath, "media", "bridge-client.js"),
        "utf8"
      );
      const webview = this.view.webview;
      const { html } = await assembleDocument({
        serverBase: url,
        cookie: this.manager.authCookieHeader,
        distRootPath: distRootPath(this.context),
        // Each webview has its own origin, so local URIs must be minted from
        // THIS webview even though the dist cache is shared with the panel.
        asWebviewUri: (p) => webview.asWebviewUri(vscode.Uri.file(p)).toString(),
        bridgeClientJs: bridgeJs,
        cspSource: webview.cspSource,
        themeDark: isDarkTheme(),
        sessionPreset: this.pendingPreset,
        chromeHtml: statusChromeHtml(),
        dropHint: t("context.dropHint"),
        log: (m) => console.log("[dsh] " + m),
      });
      this.view.webview.html = html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postStatus({ state: "error", message: msg });
    }
  }

  private postStatus(info: ServerInfo): void {
    this.view?.webview.postMessage({ type: "server-status", ...info });
  }
}
