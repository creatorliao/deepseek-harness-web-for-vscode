// DeepSeek Harness editor panel (T8, revised 2026-08-17: sidebar -> editor
// tab, display style aligned with Claude Code) + server-status overlay (T9).
// The overlay markup, theme probe and dist-cache path are shared with the
// secondary-side-bar view and live in dshUi.ts.
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { DshServerManager, type ServerInfo } from "./serverManager.js";
import { assembleDocument } from "./documentAssembly.js";
import { BridgeHost } from "./bridgeHost.js";
import { dshStartOptions, workspaceRoot } from "./commands.js";
import {
  distRootPath,
  isDarkTheme,
  placeholderHtml,
  statusChromeHtml,
  deliverDropToComposer,
  handleInsertResult,
} from "./dshUi.js";
import { t } from "./i18n.js";

const PANEL_TITLE = "DeepSeek Harness";

/** One editor-tab WebviewPanel hosting the DSH UI over the transport bridge. */
export class DshPanel {
  public static readonly viewType = "deepseek-harness.panel";

  private panel?: vscode.WebviewPanel;
  private bridge?: BridgeHost;
  private pendingPreset?: string;
  private disposedCbs: (() => void)[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly manager: DshServerManager,
    /** Session bound to this panel (02-session-management T3); undefined = unbound. */
    private readonly sessionId?: string
  ) {
    // Only mirror state into the overlay/placeholder; the extension drives
    // panel (re)assembly AFTER theme sync so the page loads with the right
    // color scheme (R7 ordering fix, 2026-08-17).
    manager.on("state", (info: ServerInfo) => {
      this.postStatus(info);
    });
    // Live theme switch: the embedded client resolves "system" via the
    // matchMedia shim, so push the VS Code theme without a page reload.
    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme((e) => {
        const dark =
          e.kind === vscode.ColorThemeKind.Dark || e.kind === vscode.ColorThemeKind.HighContrast;
        this.panel?.webview.postMessage({ type: "theme-preference", dark });
      })
    );
  }

  /**
   * Create the editor tab, or reveal the existing one (re-assembling when
   * ready). `sessionPreset` (optional, req R2/T7d) is the localStorage payload
   * for `dsh.sessions.current` — written before the DSH module script runs so
   * the frontend selects the IDE workspace.
   */
  open(
    sessionPreset?: string,
    viewColumn: vscode.ViewColumn = vscode.ViewColumn.Beside
  ): void {
    this.pendingPreset = sessionPreset;
    if (this.panel) {
      this.panel.reveal(viewColumn);
      if (this.manager.state === "ready") void this.refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      DshPanel.viewType,
      PANEL_TITLE,
      viewColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(distRootPath(this.context))],
      }
    );
    // Tab icon: WebviewPanel.iconPath is a settable property (unlike options).
    panel.iconPath = vscode.Uri.file(path.join(this.context.extensionUri.fsPath, "media", "icon.png"));
    this.panel = panel;
    this.bridge = new BridgeHost(
      panel.webview,
      () => this.manager.serverUrl ?? "",
      () => this.manager.authCookieHeader
    );

    // View-level commands from the placeholder/overlay chrome, plus the two
    // messages of the explorer-reference path (R20260917-01).
    panel.webview.onDidReceiveMessage((msg) => {
      const m = msg as { type?: string; payload?: unknown; ok?: unknown; text?: unknown };
      if (m.type === "start") {
        void this.manager.start(dshStartOptions()).catch(() => {
          /* state machine drives the overlay */
        });
      } else if (m.type === "stop") {
        this.manager.stop();
      } else if (m.type === "dsh-context-drop") {
        void deliverDropToComposer(panel.webview, m.payload, workspaceRoot());
      } else if (m.type === "dsh-context-insert-result") {
        handleInsertResult(m);
      }
    });
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.bridge?.dispose();
      this.bridge = undefined;
      for (const cb of this.disposedCbs) cb();
    });

    panel.webview.html = placeholderHtml();
    this.postStatus({ state: this.manager.state, url: this.manager.serverUrl });
    if (this.manager.state === "ready") void this.refresh();
  }

  /** Reveal the panel if it exists (used by the start command). */
  reveal(viewColumn?: vscode.ViewColumn): void {
    this.open(undefined, viewColumn);
  }

  /** Session bound to this panel (02-session-management T3). */
  get boundSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Whether the panel is showing in the UI (target picking for the context menu). */
  get isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  /**
   * Post one message to this panel's webview. Used by the explorer context-menu
   * entry, which has no webview message of its own to reply to.
   */
  postMessage(message: unknown): void {
    void this.panel?.webview.postMessage(message);
  }

  /** Set the editor-tab title to reflect the session (review suggestion 3). */
  updateTitle(title: string): void {
    if (this.panel) this.panel.title = title ? `DSH: ${title}` : PANEL_TITLE;
  }

  /** Register a callback invoked when the editor tab is disposed (user close). */
  onDisposed(cb: () => void): void {
    this.disposedCbs.push(cb);
  }

  /**
   * Close the editor tab (01-workspace-alignment T2, R5 semantics: the DSH
   * session persists and the server is NOT stopped — onDidDispose clears the
   * panel/bridge only).
   */
  close(): void {
    this.panel?.dispose();
  }

  private async refresh(): Promise<void> {
    const url = this.manager.serverUrl;
    if (!url || !this.panel) return;
    try {
      const bridgeJs = fs.readFileSync(
        path.join(this.context.extensionUri.fsPath, "media", "bridge-client.js"),
        "utf8"
      );
      const webview = this.panel.webview;
      const { html } = await assembleDocument({
        serverBase: url,
        // dsh 0.1.2+ serves / behind the browser-session cookie; without it the
        // index fetch (and any fenced asset) returns 401 and the panel errors.
        cookie: this.manager.authCookieHeader,
        distRootPath: distRootPath(this.context),
        asWebviewUri: (p) => webview.asWebviewUri(vscode.Uri.file(p)).toString(),
        bridgeClientJs: bridgeJs,
        cspSource: webview.cspSource,
        themeDark: isDarkTheme(),
        sessionPreset: this.pendingPreset,
        chromeHtml: statusChromeHtml(),
        dropHint: t("context.dropHint"),
        log: (m) => console.log("[dsh] " + m),
      });
      this.panel.webview.html = html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.postStatus({ state: "error", message: msg });
    }
  }

  private postStatus(info: ServerInfo): void {
    this.panel?.webview.postMessage({ type: "server-status", ...info });
  }
}
