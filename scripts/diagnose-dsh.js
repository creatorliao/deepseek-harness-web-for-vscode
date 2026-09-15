// "Why won't dsh start?" — prints everything the extension needs to know:
// which binary auto-detection picks, its version, whether it advertises
// --no-open, and how long it takes to print its ready line.
//
//   npm run diagnose:dsh              # full report (starts one short-lived server)
//   npm run diagnose:dsh -- --no-start # resolution only, nothing is spawned
//
// Read-only apart from the single start probe, which always passes --no-open
// (so no browser opens) and kills the child immediately after.
"use strict";
const { spawn, spawnSync } = require("node:child_process");
const os = require("node:os");
const { resolveDshPath, resolveDshVersion, probeNoOpenSupport } = require("../out/serverManager.js");

const HOME = os.homedir();
const skipStart = process.argv.includes("--no-start");
const READY_RE = /dsh web: http:\/\/127\.0\.0\.1:\d+/;

function npmPrefix() {
  const res = spawnSync("npm", ["prefix", "-g"], {
    encoding: "utf8",
    timeout: 10_000,
    shell: process.platform === "win32",
  });
  return { status: res.status, out: (res.stdout || "").trim(), err: (res.stderr || "").trim().slice(0, 200) };
}

function startProbe(bin) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(
      process.platform === "win32" && /[\\/]/.test(bin) ? `"${bin}"` : bin,
      ["web", "--port", "0", "--no-open"],
      { cwd: HOME, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" }
    );
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { shell: true });
        child.kill();
      } catch {
        /* already gone */
      }
      resolve({ ms: Date.now() - t0, result });
    };
    child.stdout.on("data", (d) => {
      const text = d.toString();
      if (READY_RE.test(text)) finish("ready line printed");
    });
    child.stderr.on("data", (d) => {
      const text = d.toString().trim();
      if (text) console.log("   stderr:", JSON.stringify(text.slice(0, 300)));
    });
    child.on("error", (e) => finish(`spawn failed: ${e.code} ${e.message}`));
    child.on("exit", (c) => finish(`exited first (code=${c})`));
    setTimeout(() => finish("TIMEOUT after 60s — the extension would report 'did not become ready'"), 60_000);
  });
}

(async () => {
  console.log("=== 环境 ===");
  console.log("  platform   :", process.platform, "| node", process.version);
  console.log("  homedir    :", HOME);
  console.log("  cwd        :", process.cwd());
  console.log("  DSH_BIN    :", JSON.stringify(process.env.DSH_BIN ?? null));

  const prefix = npmPrefix();
  console.log("\n=== npm 全局前缀（决定 npm 全局 dsh 能否被探测到）===");
  console.log("  npm prefix -g ->", prefix.status, JSON.stringify(prefix.out), prefix.err || "");
  if (!prefix.out) {
    console.log("  ⚠️ 拿不到前缀：npm 全局安装的 dsh 会被跳过。常见原因是 npm 不在 PATH 上，");
    console.log("     或（Windows）spawnSync 未加 shell 导致 npm.cmd 无法执行。");
  }

  const resolved = resolveDshPath();
  console.log("\n=== 自动探测结果 ===");
  console.log("  resolved   :", resolved.path ?? "(null → 退化为裸 PATH 查找 'dsh')");
  const bin = resolved.path ?? "dsh";
  console.log("  version    :", resolveDshVersion(bin));
  const noOpen = probeNoOpenSupport(bin);
  console.log(
    "  --no-open  :",
    noOpen === null ? "null（探测不确定 → 扩展回退到版本号判断，仍会传 --no-open）" : noOpen
  );
  console.log("  探测过的路径:");
  for (const t of resolved.tried) console.log("     ", t);

  if (skipStart) {
    console.log("\n（--no-start：跳过启动实测）");
    return;
  }

  console.log("\n=== 启动实测（dsh web --port 0 --no-open）===");
  const { ms, result } = await startProbe(bin);
  console.log(`  ${ms} ms  ${result}`);
  console.log("  参考：本机历史实测 4.3–4.6s（0.1.2-rc.1）、7.4–7.9s（0.1.5-rc.1）；");
  console.log("        扩展的就绪超时为 60s（2026-09-14 由 10s 上调）。");
})();
