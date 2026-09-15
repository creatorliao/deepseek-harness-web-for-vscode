// Shared pieces for BOTH DSH surfaces: the editor-tab webview panel
// (dshPanel.ts) and the secondary-side-bar webview view (chatView.ts).
// Keeping them here avoids two copies of the overlay markup, the theme probe
// and the dist-cache location drifting apart.
import * as path from "node:path";
import * as vscode from "vscode";
import { t, langCode } from "./i18n.js";

const DIST_DIR_NAME = "dsh-dist";

/** Where the downloaded DSH dist tree is cached (shared by every surface). */
export function distRootPath(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, DIST_DIR_NAME);
}

/** VS Code dark-mode hint fed into the document and the matchMedia shim. */
export function isDarkTheme(): boolean {
  const k = vscode.window.activeColorTheme.kind;
  return k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast;
}

/** Minimal shell shown before the server is ready (never a blank surface). */
export function placeholderHtml(): string {
  return `<!DOCTYPE html>
<html lang="${langCode()}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>html,body{height:100%;margin:0;background:var(--vscode-editor-background)}</style>
</head>
<body>${statusChromeHtml()}
<script>
(function(){
  var overlay = document.getElementById("dsh-overlay");
  var msg = document.getElementById("dsh-msg");
  var btn = document.getElementById("dsh-start");
  overlay.hidden = false;
  msg.textContent = ${JSON.stringify(t("overlay.stopped"))};
  btn.style.display = "inline-block";
})();
</script>
</body>
</html>`;
}

/** Overlay + status listener injected into the assembled document (T9). */
export function statusChromeHtml(): string {
  return `
<style>
#dsh-overlay{position:fixed;inset:0;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;
background:var(--vscode-editor-background);color:var(--vscode-foreground);
font-family:var(--vscode-font-family);font-size:13px;text-align:center;padding:24px;z-index:9999}
#dsh-overlay[hidden]{display:none}
#dsh-start{background:var(--vscode-button-background);color:var(--vscode-button-foreground);
border:none;border-radius:3px;padding:6px 16px;font-family:var(--vscode-font-family);font-size:13px;cursor:pointer}
#dsh-start:hover{background:var(--vscode-button-hoverBackground)}
</style>
<div id="dsh-overlay" hidden>
  <div id="dsh-msg">DeepSeek Harness</div>
  <button id="dsh-start" style="display:none">${t("button.start")}</button>
</div>
<script>
(function(){
  var overlay = document.getElementById("dsh-overlay");
  var msg = document.getElementById("dsh-msg");
  var btn = document.getElementById("dsh-start");
  var vscode = acquireVsCodeApi();
  btn.onclick = function () { vscode.postMessage({ type: "start" }); };
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.type !== "server-status") return;
    if (m.state === "ready") { overlay.hidden = true; return; }
    overlay.hidden = false;
    btn.style.display = m.state === "stopped" || m.state === "error" ? "inline-block" : "none";
    if (m.state === "starting") msg.textContent = ${JSON.stringify(t("overlay.starting"))};
    else if (m.state === "stopped") msg.textContent = ${JSON.stringify(t("overlay.stopped"))};
    else if (m.state === "error") msg.textContent = ${JSON.stringify(t("overlay.error", { message: "{message}" }))}.replace("{message}", m.message || "unknown");
  });
})();
</script>`;
}
