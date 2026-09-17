// Build the installable extension package into dist/, keeping exactly ONE
// vsix there at any time (the newest). The filename carries the version, so an
// imported package can always be traced back to a release.
//
// Why a script instead of a raw `vsce package`: the output must land in dist/
// with a stable, version-stamped name, and stale builds must be removed first —
// neither is expressible in a one-line cross-platform npm script.
"use strict";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const distDir = path.join(root, "dist");
const fileName = `${pkg.publisher}.${pkg.name}-${pkg.version}.vsix`;
const outFile = path.join(distDir, fileName);

// Keep exactly one package: drop every previously built vsix first.
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const vsce = path.join(root, "node_modules", "@vscode", "vsce", "vsce");
// NOTE: do NOT add `--no-dependencies` here to avoid vsce's `npm list` companion
// process. Measured on 0.5.0 with `vsce ls`: that flag silently drops all 19
// `node_modules/ws/**` entries — vsce ignores `files` patterns for node_modules
// unless dependency detection confirms them — and a package without `ws` fails
// at activation (the v0.0.11 incident, see
// docs/01-Projects/R20260817-01-桥架构与IDE内嵌/11-修复_vsix缺少ws依赖.md).
// Packaging therefore needs an environment that can spawn npm; a restricted
// sandbox fails here with `spawn EPERM`.
const result = spawnSync(process.execPath, [vsce, "package", "--out", outFile], {
  cwd: root,
  stdio: "inherit",
});
if (result.status !== 0) {
  console.error(`\n[package] FAILED: vsce exited with ${result.status}`);
  process.exit(result.status ?? 1);
}

const built = fs.readdirSync(distDir).filter((f) => f.endsWith(".vsix"));
if (built.length !== 1) {
  console.error(
    `\n[package] FAILED: expected exactly 1 vsix in dist/, found ${built.length}: ${built.join(", ")}`
  );
  process.exit(1);
}
const size = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`\n[package] OK -> dist/${fileName} (${size} KB)`);
console.log("[package] 导入方式：VS Code / Cursor 扩展视图 → ... → Install from VSIX... 选择该文件");
