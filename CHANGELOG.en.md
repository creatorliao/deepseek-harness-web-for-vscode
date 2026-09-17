# Changelog

**English** | [中文](CHANGELOG.md)

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-09-17

### Added

- **Drag a file from the explorer onto the DSH composer and it becomes an `@` reference** (the Cursor "drag a file into chat" flow): dropping one file, a multi-selection, or a folder writes `@workspace-relative/path` (paths with spaces become `@"…"`, folders get a trailing `/`) — **functionally identical** to picking the file from the `@` completion.
  - ⚠️ **Hold `Shift` while dragging.** That is a VS Code constraint, not a choice made here: for the duration of any in-window drag VS Code disables pointer events on every webview iframe ("Webview break drag and dropping around the main window" in its own source), and Shift is the documented escape hatch — the official fix for microsoft/vscode#182449 (PR #209211, 1.93+). Without Shift the file is opened in the editor area, which looks like the feature doing nothing.
  - **Equivalent context-menu entry (no Shift needed)**: select files in the explorer → right-click → **添加到 DSH 输入框（@ 引用）**. Multi-select and folders included. It exists because the drag path can additionally be blocked by an open VS Code bug (microsoft/vscode#237958).
  - The text written is plain `@path`: DSH's `@` completion chip serializes to exactly that string, so the message the model receives is byte-identical — no chip in the UI, identical meaning. Deliberate trade-off: upstream exposes no way to insert a chip programmatically, and re-creating one buys no functionality.
  - Only "resource" drags are taken over: dragging real files from the **OS** (still handled by DSH's own attachment upload) and dragging a **text selection** out of an editor behave exactly as before.
  - A failed write (busy / read-only composer) is never reported as success: the references go to the clipboard with a Chinese warning to press `Ctrl+V`.
  - References are relative to the workspace root (the `dsh` child's cwd); files outside it keep their absolute path.
- New command **`添加到 DSH 输入框（@ 引用）`** (explorer context menu).

## [0.4.0] - 2026-09-15

### Fixed

- **Startup failure `dsh did not become ready within 10000ms`** (most likely on Windows, and it makes
  the whole extension unusable):
  - **Ready timeout raised from 10s to 60s.** Measured: `dsh web --port 0` needs **4.3–9.3s** to print
    its ready line (`0.1.2-rc.1` ≈ 4.3s; **`0.1.5-rc.1` ≈ 7.4–9.3s**). The old 10s budget left under
    3s of headroom for 0.1.5, so a cold start, an antivirus scan or a first run in a new workspace
    produced a false timeout.
  - **Fixed "a globally npm-installed dsh is never detected" on Windows**: `npm prefix -g` was called
    through `spawnSync` without `shell`, and Windows' `npm` is `npm.cmd`, so the call failed silently
    and the most common install layout was skipped entirely, degrading to a bare PATH lookup.
  - The `--no-open` capability probe timeout was raised from 5s to 20s (`dsh web --help` measures
    4.3–5.3s; the old budget sat right on the edge and failed intermittently).
  - Fixed a binary path containing spaces being split by cmd.exe under `shell: true`.
  - An unset `$DSH_BIN` no longer produces a malformed bare `.cmd` candidate.
  - **The timeout error now quotes the child's real output** (`bin=` / `version=` / `stdout=` /
    `stderr=`) instead of being undiagnosable; a missing manually-configured binary is named
    explicitly along with the setting to check.
- **A failed start reported only `dsh exited before ready (code=1, signal=null)` with no reason at all**:
  the child **exit** branch dropped stderr entirely, while the **timeout** branch in the same file had
  been quoting `stdout=` / `stderr=` all along — so the same failure was diagnosable one way and opaque
  the other. Both exit messages now carry the **first error line** from stderr (`first error: …`) plus
  the stderr tail.
  - Why the tail alone is not enough: the real failure prints a long AggregateError, and only 600 bytes
    of tail are kept — **all of it closing braces**.
  - The failure that prompted this: the global dsh was left **half-installed** by npm (koffi's JS wrapper
    at `3.3.0`, its native binary still `3.2.1`) → every `dsh web` boot died with
    `Mismatched native Koffi modules`, exit code 1. Full evidence chain:
    `docs/01-Projects/R20260820-01-上游DSH版本适配/12-修复_全局dsh半装koffi错配导致启动即退码1.md`.
  - ⚠️ This only fixes **diagnosability**: `Mismatched native Koffi modules` means the local npm global
    install is broken, not the extension. The cure is to stop the leftover dsh process holding the native
    module and reinstall (`docs/02-Areas/20260915-01-内核升级最佳实践.md` §4.1 has the self-check).
- **Pasted screenshots did not render in the panel** (the thumbnail and in-message images were
  broken images showing the `image.png` alt text): the injected CSP `img-src` did not allow `blob:`,
  while the DSH client renders **every** image preview from a `URL.createObjectURL` Blob URL, so the
  webview refused to load it. `blob:` is now allowed (`buildCsp()` in `src/documentAssembly.ts`),
  with a comment marking that entry (and `http://127.0.0.1:*` in `script-src`) as load-bearing so it
  is not dropped as redundant later. Only *display* was broken — images were always sent inline as
  base64, which is why they could be sent but not seen.
- **The welcome notice reappeared on every panel load, and panel settings never persisted**: the
  embedded page's origin is `vscode-webview://…`, so the DSH client classified it as
  `isLoopback=false` and put its settings scope in **memory mode** — an acknowledgement only set a
  variable inside that document, discarded on the next panel assembly (the button still closed, so
  it looked like it worked); the same root cause kept every settings write (Models page included) in
  memory. The bridge now declares the upstream carrier hook
  `window.__DSH_TRANSPORT__ = { fetch, ownsHost: true }` (`media/bridge-client.js`), flipping
  `isLoopback` to true and returning persistence to `host`.
  ⚠️ **Behavior change**: settings changed in the panel now really land in `~/.dsh/settings.yaml` and
  become visible to the browser UI — consistent with this project's existing "extension and browser
  share `~/.dsh`" boundary, but a behavior change nonetheless.

### Changed (project & docs)

- **Project ownership and identity**: the project is now maintained by `liaohai1`; authorship and
  copyright belong to `liaohai1`. Extension id changed from
  `floatinghotpot.deepseek-harness-web-for-vscode` to **`creatorliao.deepseek-harness-for-vscode`**,
  display name to **DeepSeek Harness for VS Code**, repository to
  `creatorliao/deepseek-harness-for-vscode`. ⚠️ This is an **id change**: editors treat it as a
  different extension, and existing installs/settings do not migrate automatically.
- **Documentation restructured into PARA**: `doc/` became `docs/`, organized as `01-Projects`
  (evolution history, one folder per theme) / `02-Areas` (project standards) / `03-Resources`
  (external references) / `04-Archives` (retired material). Working rules are consolidated in
  `AGENTS.md` (single source of truth); `CLAUDE.md` is now a pointer to it.
- **README / CHANGELOG main files are now Chinese**; English versions remain as `README.en.md` /
  `CHANGELOG.en.md`.

### Added

- **`dist/` build artifact convention**: `npm run package` now builds into `dist/`, which keeps
  **exactly one** vsix (the newest) with the version in its filename
  (`creatorliao.deepseek-harness-for-vscode-<version>.vsix`), ready to import into VS Code / Cursor.
- **Upstream tracking**: `npm run check:dsh` (compares the compatibility baseline with what npm
  currently publishes), a machine-readable baseline at `docs/02-Areas/dsh-baseline.json`, and a
  weekly watcher workflow `.github/workflows/upstream-watch.yml`.
- **The DSH UI now opens in the right-hand editor group by default** (docked on the right, Cursor-style):
  `DeepSeek Harness: Open in Editor Tab`, or any start path, docks the full DSH Web UI — **Composer
  included** — in the rightmost editor group. A single group gets a new right-hand one; with several
  groups the existing rightmost is reused (so opening again never keeps splitting the editor).
- **The Secondary Side Bar surface is still available, now opt-in**: a
  `contributes.viewsContainers.secondarySidebar` container plus the webview view
  `deepseek-harness.chatView`; set `deepseekHarness.openTarget` to `sidebar` to pin the UI there.
  ⚠️ It is narrow (DSH is a three-column app; in a ~300px bar its conversation column is squeezed),
  and if the Secondary Side Bar is not visible you get no input box at all — **which is why the
  default was changed back to `editorTab`**.
- New setting `deepseekHarness.openTarget` (default `editorTab`) choosing the start/open surface;
  both surfaces stay reachable from the Command Palette.
- New commands `Open in Side Bar` / `Open in Editor Tab`.
- **`npm run diagnose:dsh`** — prints the environment, the npm global prefix, the auto-detection
  result and its `tried` list, then measures how long `dsh web` actually takes to start.
- **New setting `deepseekHarness.dshPath`** (default **empty = auto-detect**): only needed when the
  wrong `dsh` is picked or auto-detection fails. In the normal case **nothing has to be configured**.
- **An explicit "Open chat" button in the launcher sidebar** (primary, full width, shown once the
  server is ready). The panel previously only reported status and listed sessions with **no way in**
  to the DSH UI, which left users stuck at "it started, but where do I type?". (The button had been
  dropped as "redundant" in v0.2.0; it is back.)

### Changed (breaking)

- **The UI language is Simplified Chinese only**: the `ja / ko / ru / es / pt / fr / de` translations
  are gone, and `package.nls.zh-cn.json` is removed (`package.nls.json` now holds Chinese, so no
  locale can fall back to English). `src/i18nStrings.ts` keeps a single `zh` field per row — the
  table shrank from 506 to 151 lines.
- **`engines.vscode` raised from `^1.90.0` to `^1.105.0`** — the secondary-side-bar contribution
  point needs VS Code ≥ 1.100, and `1.105` is the floor that covers both VS Code **1.105.1** and
  **Cursor 1.128.0** on this machine. (It was briefly set to `^1.137.0` and Cursor then refused the
  install: `not compatible with VS Code '1.128.0'` — `engines` is a **floor**, not a design target;
  raising it only locks people out.)
  `devDependencies["@types/vscode"]` is now **pinned** to `1.105.0` (it was `^1.90.0`, which resolved
  to the newest types — leaving compile-time types newer than the engine floor).
  ⚠️ **Editors 1.90–1.104 are no longer supported**; Antigravity users should confirm a VS Code
  baseline of ≥ 1.105.
- Because `deepseekHarness.openTarget` defaults to `editorTab`, **starting DSH now opens the UI in
  the right-hand editor group**. Set it to `sidebar` to pin the UI in the Secondary Side Bar.

## [0.3.4] - 2026-09-07

### Fixed
- **Works with dsh 0.1.2-rc.1** — upgrading dsh past 0.1.1-rc.7 left the embedded panel unable to start: 0.1.2-rc.1 prints an *authenticated* launch URL (`dsh web: http://127.0.0.1:<port>/?token=…`), requires a browser-session cookie (minted from that token) for `/` and every `/api` call, moves the RPC API to Typert `namespace/method` endpoints (workspace listing is now the `workspace/follow` stream baseline), and serves a frontend dist that references its assets relatively (`./assets/...`) with a new `batches` boot section. The extension now exchanges the launch token for the session cookie **before** the server is marked ready, attaches it to every relayed request / WebSocket upgrade / panel assembly, speaks the 0.1.2 RPC surface (session list, create, rename, archive, workspace alignment), and assembles the 0.1.2 dist layout.
- **Clear error instead of a half-broken state on old dsh** — the extension now requires dsh **0.1.2-rc.1 or newer**; an older build is refused at start with a helpful upgrade message (older dsh speaks the pre-0.1.2 API surface, which is no longer supported).
- **"Open in Browser" opened a dead URL** — the command now opens the authenticated URL (`?token=…`) so a real browser can mint its own session cookie, instead of landing on the 401 page.

## [0.3.3] - 2026-08-22

### Fixed
- **Sidebar status frozen on "Starting…"** — after switching the sidebar (e.g. file tree ↔ DeepSeek Harness) or waking the laptop, the sidebar status could stay on the blinking "Starting…" state even though the service was ready and the session list refreshed normally. The status message was sent before the sidebar page finished loading and got dropped. The page now signals when it is ready to receive updates, and the extension re-pushes the current status then.

## [0.3.2] - 2026-08-20

### Fixed
- **"Failed to load plugins" with dsh 0.1.1-rc.2** — upgrading dsh to 0.1.1-rc.2 broke the embedded panel again: the boot manifest changed its injection from `window.__DSH_BOOT__` to `globalThis["__DSH_BOOT__"]`, so plugin bundle URLs were no longer rewritten to the server and the webview could not load them ("bundle script /plugins/... failed to load"). Both boot shapes are now recognized.

## [0.3.1] - 2026-08-20

### Fixed
- **"Failed to load plugins" error in the embedded panel** — the panel could show *"Failed to load plugins / HTML did not preload @deepseek-ai/dsh-client-modules/client.js"* when using newer dsh versions (rc.8+). The panel now loads plugins correctly.
- **A browser tab no longer opens on its own** — starting the extension could automatically open your default browser to the DeepSeek Harness UI. That's now suppressed; the UI stays embedded in VS Code. (Use the "Open in Browser" command if you ever want it in a browser.)
- **Prerelease upgrade hints now appear** — if a newer prerelease (e.g. rc.8) of dsh is available, the sidebar shows the upgrade hint as expected instead of silently hiding it.
- **No more error when closing VS Code** — closing or reloading the window could log a "DisposableStore" error to the console. That's gone.

### Added
- **Extension version shown in the sidebar** — the launcher header now displays `extension v0.3.1` under the DeepSeek Harness title, so you can always tell which extension version you're running.

## [0.3.0] - 2026-08-20

### Added
- **Dual-channel upgrade hints** — the sidebar now tracks both npm channels: a **latest** button and a **next** (prerelease) button appear independently when a newer version exists on that channel (e.g. `latest 0.1.0-rc.7` + `next 0.1.0-rc.8`); each opens a QuickPick with the matching `@latest` / `@next` command (prefilled into a terminal, never auto-run).
- **`--no-open` browser suppression** — dsh 0.1.0-rc.8+ opens the default browser on `dsh web` by default; the extension now passes `--no-open` (version-gated, so older CLIs that reject the flag are unaffected) to keep the embedded UI browser-free.

### Fixed
- Session list stayed empty when the launcher sidebar was opened while dsh was **already running** (polling only started on a state transition). It now polls immediately at view open.

## [0.2.0] - 2026-08-19

### Added
- **Session manager** in the sidebar — lists all active sessions with title, relative activity time (`5m`/`3h`/`2d`), inline rename (`✎`), and archive (`✕`); an expandable **Archived** section shows archived sessions with titles; blank sessions appear as "New Session" rows. Refreshes every 5s (server-state aware, re-entry guarded).
- **Multi-panel sessions** — `＋New session` opens a fresh editor panel bound to a new session; clicking a listed session opens/focuses its panel; panels **stack over the current tab group** (no more tiled narrow views).
- **Archive closes the panel** — archiving a session also closes its open panel; the default panel is bound to the IDE workspace session so it can be closed too.
- **Reload restores every open panel** — the dist-tree cache download is guarded against concurrent access, so restoring several panels at once never produces blank panels.
- UI strings for the new features across all 9 languages.

### Fixed
- Blank sessions no longer accumulate on every start — existing ones are reused.
- macOS realpath mismatch (`/var/folders` vs `/private/var/folders`) no longer breaks workspace matching.

### Changed
- Removed the redundant "Open View" button from the sidebar launcher (the command and status-bar entry remain).

## [0.1.0] - 2026-08-18

### Added
- **Workspace alignment** — the DSH workspace anchor now follows the IDE workspace (feature M1):
  - Switching folders closes stale panels and starts cold; reloading the *same* workspace auto-restarts dsh and restores the panel.
  - The embedded UI shows the **current IDE workspace** (not the most recently active one) via a session preset injected before the DSH frontend boots.
  - Clicking the activity-bar icon auto-starts dsh when it is not running.
- **dsh version soft-check + upgrade helper** — the sidebar shows "Update available: x.y.z →" when a newer dsh exists; clicking offers an upgrade command matched to your install method (npx cache / npm global / nvm) in a QuickPick, prefilled into an integrated terminal (never auto-run). Checks are gated to once per 24h and offline-safe.
- **Sidebar refinements** — full-width buttons (Stop above Open View), two-line status (version + URL), removed the subtitle.
- UI strings for the new features across all 9 languages.

## [0.0.10] - 2026-08-17

### Added
- Extension UI translations: Japanese, Korean, Russian, Spanish, Portuguese, French and German (9 languages total; follows the VS Code display language).

## [0.0.9] - 2026-08-17

### Fixed
- Cross-platform dsh process termination: on Windows, kill the full process tree (`taskkill /T /F`) so the `cmd.exe` wrapper no longer orphans the `node` child.
- Unit-test portability: platform-agnostic path assertions and a Windows-compatible fake `dsh` shim.

### Changed
- CI smoke step now has a 15-minute timeout.

## [0.0.8] - 2026-08-17

### Added
- Cross-platform CI matrix (macOS, Ubuntu, Windows) with a real `dsh` spawn smoke test.
- README badges (CI, Open VSX version/downloads, Marketplace link).

### Fixed
- Windows binary resolution (`dsh.cmd`, `%LocalAppData%\npm-cache` layout) and `shell: true` spawn.

## [0.0.7] - 2026-08-17

### Changed
- Pointed `repository` at the renamed GitHub repo.

## [0.0.6] - 2026-08-17

### Changed
- Renamed the display name to "DeepSeek Harness Web for VS Code" (VS Code Marketplace display names are globally unique).

## [0.0.5] - 2026-08-17

### Changed
- Renamed the extension id to `deepseek-harness-web-for-vscode` (VS Code Marketplace extension names are globally unique).

## [0.0.4] - 2026-08-17

### Added
- DeepSeek tab icon on the editor-tab webview.

## [0.0.3] - 2026-08-17

### Added
- Central bilingual (en/zh) string table; the UI follows the VS Code language.
- English-only marketplace description.

## [0.0.2] - 2026-08-17

### Fixed
- Bundled the runtime `ws` dependency into the vsix (activation crashed without it on a fresh install).

## [0.0.1] - 2026-08-17

### Added
- Initial MVP: spawn `dsh web`, transport bridge (fetch/WebSocket/clipboard), editor-tab webview, sidebar launcher, status bar, theme sync, and packaging.
