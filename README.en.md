# DeepSeek Harness for VS Code

**English** | [中文](README.md)

[![License](https://img.shields.io/github/license/creatorliao/deepseek-harness-for-vscode)](LICENSE)
[![CI](https://github.com/creatorliao/deepseek-harness-for-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/creatorliao/deepseek-harness-for-vscode/actions)
[![GitHub Release](https://img.shields.io/github/v/release/creatorliao/deepseek-harness-for-vscode)](https://github.com/creatorliao/deepseek-harness-for-vscode/releases/latest)
[![Open VSX Version](https://img.shields.io/open-vsx/v/creatorliao/deepseek-harness-for-vscode)](https://open-vsx.org/extension/creatorliao/deepseek-harness-for-vscode)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/creatorliao/deepseek-harness-for-vscode)](https://open-vsx.org/extension/creatorliao/deepseek-harness-for-vscode)

Launch **DeepSeek Harness** and embed its full Web UI inside VS Code (and Antigravity, the VS Code fork) — so you can run DSH Agents and edit code in one window, sharing the same instance as your browser.

## Screenshot / 截图

![DeepSeek Harness embedded in Antigravity](media/antigravity.jpg)

## Features

- **Stay in your editor** — use DeepSeek Harness and write code in the same window, in **VS Code or Antigravity**; no more switching between the IDE and a browser tab to watch the Agent work.
- **One of your Agent stack** — VS Code / Antigravity let you install multiple coding-agent extensions, each powered by its own LLM (e.g. Claude Code, ChatGPT, …), and this extension is one of them: a DeepSeek Harness Agent that works side by side with the others. Run several Agents on the same task at the same time to cross-review answers and cover each model's blind spots.
- **One-click start / stop** — the extension manages a `dsh web` child process with an OS-assigned port. Entry points: activity-bar icon (sidebar launcher), status-bar button, or Command Palette.
- **Docked on the right, like a chat companion** — the DSH UI opens in VS Code's **Secondary Side Bar** by default, so it never takes over an editor tab and cannot be dragged away by accident. Need side-by-side comparison or a wide surface for heavy work? The `Open in Editor Tab` command gives you that, and you can switch the default in the settings.
- **Embedded Web UI in an editor tab (optional surface)** — the full DSH frontend (conversations, workspaces, settings, plugins, Goals, Workflows) can also render as a regular editor tab, side by side with your files — it never overlaps the explorer tree.
- **Works with the browser instance** — uses your `~/.dsh` by default, so sessions and settings are shared with the browser UI.
- **Current folder as workspace** — the DSH default project directory is the folder you have open.
- **Workspace alignment** — the DSH workspace anchor follows your IDE workspace: switching folders closes stale panels and starts cold, reloading the same workspace auto-restarts the server and restores the panel, and the embedded UI always shows the *current* folder (not the most recently active one).
- **Session manager** — the sidebar lists all active sessions with title and relative activity time, with inline rename and archive; an expandable *Archived* section keeps old sessions tidy; `＋New session` opens a stacked panel bound to a fresh session, and multiple panels each hold their own conversation.
- **Auto-start from the icon** — clicking the activity-bar icon starts dsh for you when it is not running.
- **dsh version check + easy upgrade** — the launcher shows "Update available: x.y.z →" when a newer dsh exists; one click offers the right upgrade command for your install method (npx / npm global / nvm) prefilled into a terminal (24h check gate, offline-safe).
- **Clipboard works** — copy/paste in the embedded UI goes through a transport bridge (VS Code webviews block clipboard inside iframes; the bridge routes it via `vscode.env.clipboard`).
- **Drag files from the explorer onto the composer as `@` references** — dropping one file (or a multi-selection, or a folder) writes `@workspace-relative/path`, which is **functionally identical** to picking the file from the `@` completion (the model then reads the file itself).
  - ⚠️ **Hold `Shift` while dragging**: VS Code disables pointer events on every webview iframe for the duration of an in-window drag, and Shift is its documented escape hatch for dropping files into a webview. Without Shift the file is opened in the editor area instead.
  - Equivalent context-menu entry (**no Shift needed**): select files in the explorer → right-click → **添加到 DSH 输入框（@ 引用）**.
  - ℹ️ The text written is plain `@path`: DSH's `@` completion chip serializes to exactly that string, so the message the model receives is byte-identical — no chip in the UI, same meaning.
- **Theme follows VS Code** — the embedded UI follows your editor color theme (dark/light), live on switch (`deepseekHarness.themeSync`, default `follow`).
- **Cross-platform** — macOS, Linux and Windows, verified end-to-end by CI (unit tests + a real `dsh` spawn smoke test on all three).
- **Simplified Chinese only** — the extension deliberately ships a single UI language (maintaining eight extra translations cost more than it was worth). Strings live in `src/i18nStrings.ts`; manifest strings in `package.nls.json`.
- **Security first** — the server binds loopback only; the extension relays requests as plain Node requests, never weakening DSH's `/api` trust fence. (Note: the embedded page and its plugins are trusted — clipboard read/write is bridged to the system clipboard without a browser permission prompt, the same trust you grant the extension itself.)

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) installed — **0.1.2-rc.1 or newer**: `npm i -g @deepseek-ai/dsh` (older dsh builds speak the pre-0.1.2 API and are not supported)
- VS Code **≥ 1.105** — the default surface is the Secondary Side Bar, which needs the `viewsContainers.secondarySidebar` contribution point (accepted since 1.100). It also works in Antigravity via Open VSX, provided its VS Code baseline is ≥ 1.105.

## Version compatibility

Compatible dsh versions for each dsh4vscode release — any other pairing is refused at start with a clear message:

| dsh4vscode version | Compatible dsh |
|---|---|
| `0.5.0` (current) | `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2` |
| `0.4.0` | `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2` |
| `0.3.4` | `0.1.2-rc.1`, `0.1.5-rc.1`, `0.1.5-rc.2` |
| `0.3.3` | `0.1.1-rc.7` and older |

- The versions above are the tested pairings. dsh `0.1.2-rc.1` reworked its Web surface (browser-session authentication, Typert RPC, new dist layout), which extension `≤ 0.3.3` cannot use; extension `0.3.4` in turn requires dsh `≥ 0.1.2-rc.1` (older builds are refused with an upgrade hint), so an old dsh must pair with `0.3.3`.
- No hard cap on newer dsh versions, but dsh moves fast — give the embedded panel one regression check after upgrading dsh.

## Install

### From a VSIX built in this repo (currently recommended)

```sh
npm install --cache .npm-cache
npm run package        # output: dist/creatorliao.deepseek-harness-for-vscode-<version>.vsix
```

Then in **VS Code** or **Cursor**: Extensions view → `...` → **Install from VSIX...** → pick the file in `dist/`.

> Note: a locally built VSIX is unsigned (the editor asks to allow an unknown-source extension) and does
> **not** auto-update — rebuild and reinstall for new versions.

### From Open VSX (Antigravity / VSCodium / Gitpod)

Search *DeepSeek Harness for VS Code* on [Open VSX](https://open-vsx.org/), or install from the editor's Extensions view.

### About the VS Code Marketplace

This extension's Marketplace listing was **removed** by Microsoft on 2026-08-26 (removal, not
unpublishing), and Microsoft states that **removed extensions are not reinstated** — the old extension
name is permanently void. The extension is therefore available on Open VSX only. See the
[record of the incident](docs/01-Projects/R20260826-01-发布与分发/01-事件_Marketplace被移除.md).

## Usage

1. Click the **DeepSeek Harness** icon in the activity bar → dsh starts automatically (if not running) and the launcher sidebar shows the server status, version and URL.
2. The DSH UI opens in an **editor tab** once the server is ready (`dsh web: http://127.0.0.1:<port>`).
3. When the server is ready, the launcher offers **Stop DeepSeek Harness** and **Open View** (full-width buttons); click **Update available: x.y.z →** to upgrade dsh.

To make DSH use your project as its default workspace, open that folder in the window first (the launcher footer shows the active workspace).

## Configuration

| Setting | Default | Description |
|---|---|---|
| `deepseekHarness.themeSync` | `follow` | Follow the VS Code color theme into the embedded DSH UI; `off` leaves DSH's own appearance untouched. |
| `deepseekHarness.dshPath` | *(empty)* | **Optional.** Full path to the `dsh` executable. **Leave empty to auto-detect** (npm global → `$DSH_BIN` → Homebrew → nvm → npx cache) — the default and normally sufficient. Set it only when the wrong `dsh` is picked or auto-detection fails. |
| `deepseekHarness.openTarget` | `editorTab` | Where the DSH UI opens by default: `editorTab` = an editor tab in the **right-hand** editor group (default — always visible and wide enough to type in); `sidebar` = a view in the Secondary Side Bar (narrow). The other surface is always available from the Command Palette. |

## Development

```sh
npm install --cache .npm-cache
npm run compile     # tsc
npm test            # node:test unit tests
npm run watch       # incremental compile (for F5)
npm run package     # build into dist/ (keeps exactly one vsix)
npm run check:dsh   # is this project still tracking the newest upstream dsh?
```

Press `F5` in VS Code to launch the Extension Development Host.

## Architecture

The extension spawns `dsh web --port 0`, serves the DSH frontend as same-origin webview resources, and relays `fetch` / WebSocket / clipboard through a `postMessage` bridge to the extension host, which performs the real calls as plain Node requests (passing DSH's `/api` trust fence). Design and verification notes:

- Architecture proposal: [`docs/01-Projects/R20260817-01-桥架构与IDE内嵌/09-架构提案_by-deepseek.md`](docs/01-Projects/R20260817-01-桥架构与IDE内嵌/09-架构提案_by-deepseek.md)
- Transport bridge design: [`docs/01-Projects/R20260817-01-桥架构与IDE内嵌/03-方案_传输桥架构.md`](docs/01-Projects/R20260817-01-桥架构与IDE内嵌/03-方案_传输桥架构.md)
- Upstream dsh facts (version-tagged): [`docs/03-Resources/20260914-01-DSH上游事实与协议速查.md`](docs/03-Resources/20260914-01-DSH上游事实与协议速查.md)

## Project knowledge base

All design decisions, upstream facts and engineering standards live in [`docs/`](docs/) (PARA layout).
Agent working rules: [AGENTS.md](AGENTS.md). (The knowledge base itself is written in Chinese.)

## Changelog

See [CHANGELOG.en.md](CHANGELOG.en.md) (English) / [CHANGELOG.md](CHANGELOG.md) (中文).
## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 liaohai1.
