// Install the single VSIX in dist/ into the editors on THIS machine
// (`npm run install:local`).
//
// WHY THIS EXISTS (2026-09-17): the manual install steps that were actually
// needed were "find the right CLI for each editor, install, then verify the
// version" — and the Cursor CLI is not where one would guess. Recorded here so
// the next install is one command instead of four lookups. Nothing here runs on
// a user's machine unless they invoke it; the extension itself never shells out.
//
// Usage:
//   npm run install:local              # every editor found
//   npm run install:local -- code      # only VS Code
//   npm run install:local -- cursor    # only Cursor
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

/** The one vsix in dist/ (the packaging script guarantees at most one). */
function findVsix() {
  if (!fs.existsSync(DIST)) return undefined;
  const found = fs.readdirSync(DIST).filter((f) => f.endsWith(".vsix"));
  if (found.length === 0) return undefined;
  if (found.length > 1) {
    console.error(`[install] dist/ has ${found.length} vsix files; keep exactly one (${found.join(", ")})`);
    process.exit(1);
  }
  return path.join(DIST, found[0]);
}

/**
 * Editor CLIs in preference order. Windows full paths come first because the
 * bare `cursor` on PATH can resolve to Cursor's bundled `code` shim, which is
 * not the CLI that installs extensions.
 */
function cliCandidates(id) {
  const win = process.platform === "win32";
  const mac = process.platform === "darwin";
  const local = process.env.LOCALAPPDATA || "";
  if (id === "code") {
    return [
      process.env.VSCODE_BIN,
      win && path.join(local, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
      win && "C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd",
      mac && "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
      "/usr/bin/code",
      "/usr/local/bin/code",
      "/snap/bin/code",
      "code",
    ].filter(Boolean);
  }
  return [
    process.env.CURSOR_BIN,
    win && path.join(local, "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"),
    win && path.join(local, "Programs", "cursor", "resources", "app", "codeBin", "code.cmd"),
    mac && "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    path.join(os.homedir(), ".local", "bin", "cursor"),
    "/usr/bin/cursor",
    "/usr/local/bin/cursor",
    "cursor",
  ].filter(Boolean);
}

/**
 * Run one CLI. On Windows the CLIs are `.cmd` shims, which need a shell — and a
 * shell splits an unquoted path on its spaces ("Microsoft VS Code" → command
 * not found), so the whole command line is quoted here. Same trap the server
 * manager hit with the dsh binary.
 */
function run(cli, args) {
  if (process.platform !== "win32") {
    return spawnSync(cli, args, { encoding: "utf8" });
  }
  const quote = (value) => (/\s/.test(value) ? `"${value}"` : value);
  return spawnSync([quote(cli), ...args.map(quote)].join(" "), {
    encoding: "utf8",
    shell: true,
  });
}

/** First candidate that answers `--version` (a bare name is resolved via PATH). */
function findCli(id, label) {
  for (const candidate of cliCandidates(id)) {
    const result = run(candidate, ["--version"]);
    if (result.status === 0 && result.stdout) {
      return { cli: candidate, version: String(result.stdout).split(/\r?\n/)[0] };
    }
  }
  console.log(`[install] ${label}: 未找到 CLI，跳过`);
  return undefined;
}

function installInto(id, label, vsix, usedClis) {
  const found = findCli(id, label);
  if (!found) return false;
  // A bare name means PATH resolved it, and on a machine with both editors the
  // bare `code` can be the OTHER editor's shim (Cursor ships one) — say so, and
  // never let two editors share one CLI, which silently installs twice into the
  // same place while reporting success for both.
  const isPath = /[\\/]/.test(found.cli);
  if (!isPath) {
    console.log(
      `[install] ${label}: ⚠️ 用的是 PATH 上的 "${found.cli}"，无法确认属于哪个编辑器；` +
        `如装错请用 ${id === "code" ? "VSCODE_BIN" : "CURSOR_BIN"} 指定完整路径`
    );
  }
  const previous = usedClis.get(found.cli);
  if (previous !== undefined) {
    console.log(`[install] ${label}: 跳过的 CLI 与 ${previous} 相同（${found.cli}），不再重复安装`);
    return false;
  }
  usedClis.set(found.cli, label);
  console.log(`[install] ${label}: ${found.cli} (${found.version})`);
  const install = run(found.cli, ["--install-extension", vsix, "--force"]);
  if (install.status !== 0) {
    console.error(`[install] ${label}: 安装失败\n${install.stderr || install.stdout || ""}`);
    return false;
  }
  const listed = run(found.cli, ["--list-extensions", "--show-versions"]);
  const line = String(listed.stdout || "")
    .split(/\r?\n/)
    .find((l) => l.includes(`${pkg.publisher}.${pkg.name}`));
  console.log(`[install] ${label}: ${line ? line.trim() : "已安装（版本未回显）"}`);
  return true;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const editors = [
  { id: "code", label: "VS Code" },
  { id: "cursor", label: "Cursor" },
].filter((e) => only.length === 0 || only.includes(e.id));

const vsix = findVsix();
if (!vsix) {
  console.error("[install] dist/ 里没有 vsix —— 先跑 `npm run package`");
  process.exit(1);
}
console.log(`[install] ${path.basename(vsix)}`);

let installed = 0;
const usedClis = new Map();
for (const editor of editors) {
  if (installInto(editor.id, editor.label, vsix, usedClis)) installed++;
}

if (installed === 0) {
  console.error("[install] 没有安装到任何编辑器（未找到 CLI）。可设 VSCODE_BIN / CURSOR_BIN 指定路径。");
  process.exit(1);
}
console.log("[install] 完成 —— 在编辑器里执行「开发人员: 重新加载窗口」后新版本才生效");
