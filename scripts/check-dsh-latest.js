// Upstream watcher: compare the dsh versions this extension has been verified
// against (docs/02-Areas/dsh-baseline.json) with what npm currently publishes,
// and say whether the project still follows the newest official DeepSeek
// Harness. Read-only: it never writes files and never installs anything.
//
//   node scripts/check-dsh-latest.js           # report, always exit 0 (offline-safe)
//   node scripts/check-dsh-latest.js --strict  # exit 1 when a published channel is not covered
//   node scripts/check-dsh-latest.js --json    # machine-readable output
//
// Used by `npm run check:dsh` and by .github/workflows/upstream-watch.yml.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const REGISTRY_URL = "https://registry.npmjs.org/@deepseek-ai/dsh";
const FETCH_TIMEOUT_MS = 15000;
const TRACKED_CHANNELS = ["latest", "next"];
const BASELINE_PATH = path.resolve(__dirname, "..", "docs", "02-Areas", "dsh-baseline.json");

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const asJson = args.includes("--json");

/** Parse a semver-ish version (major.minor.patch with optional prerelease). */
function parse(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version).trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

/** Standard semver ordering; a release outranks any of its prereleases. */
function compareVersions(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
  }
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** A published version is covered when some verified version is >= it. */
function coveredBy(version, verified) {
  return verified.some((v) => {
    const cmp = compareVersions(v.version, version);
    return cmp !== null && cmp >= 0;
  });
}

/** A version newer than every verified one would require adaptation work. */
function newestVerified(verified) {
  return verified
    .map((v) => v.version)
    .sort((a, b) => compareVersions(a, b) ?? 0)
    .at(-1);
}

async function fetchDistTags() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
    const pkg = await res.json();
    return pkg["dist-tags"] ?? {};
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`check:dsh FAIL: 基线文件不存在：${path.relative(process.cwd(), BASELINE_PATH)}`);
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const verified = baseline.verified ?? [];

  let tags;
  try {
    tags = await fetchDistTags();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (asJson) {
      console.log(JSON.stringify({ ok: false, offline: true, error: message }, null, 2));
    } else {
      console.log(`check:dsh SKIP：无法访问 npm registry（${message}）——离线时不阻断。`);
    }
    return;
  }

  const results = TRACKED_CHANNELS.map((channel) => {
    const version = tags[channel];
    return {
      channel,
      version: version ?? null,
      covered: version ? coveredBy(version, verified) : null,
    };
  });
  const pending = results.filter((r) => r.version && r.covered === false);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok: pending.length === 0,
          extensionVersion: baseline.extensionVersion,
          minDshVersion: baseline.minDshVersion,
          verified: verified.map((v) => v.version),
          distTags: tags,
          results,
          pending,
        },
        null,
        2
      )
    );
  } else {
    console.log("上游 dsh 跟随状态");
    console.log(`  本扩展版本      : ${baseline.extensionVersion}`);
    console.log(`  已适配版本      : ${verified.map((v) => v.version).join(", ")}（最新 ${newestVerified(verified)}）`);
    console.log(`  硬版本下限      : ${baseline.minDshVersion}`);
    console.log("  npm dist-tags   :");
    for (const r of results) {
      const mark = r.covered === null ? "?" : r.covered ? "✅" : "⚠️ 未适配";
      console.log(`    ${r.channel.padEnd(6)} ${String(r.version).padEnd(14)} ${mark}`);
    }
    for (const channel of Object.keys(tags)) {
      if (!TRACKED_CHANNELS.includes(channel)) {
        // Untracked channels are not a release gate, but a version that IS in
        // verified[] must not be reported as if it were outside the baseline
        // (0.1.6-alpha.2 was deliberately adopted on 2026-09-18).
        const inBaseline = coveredBy(tags[channel], verified);
        console.log(
          `    ${channel.padEnd(6)} ${String(tags[channel]).padEnd(14)} （不跟踪该通道；${inBaseline ? "已在 verified 内" : "不在 verified 内"}）`
        );
      }
    }

    if (pending.length === 0) {
      console.log("\n结论：已跟到上游最新（latest / next 均在适配基线内）。");
    } else {
      console.log("\n结论：⚠️ 上游有新版本未适配 —— 需要做适配工作。");
      for (const p of pending) {
        console.log(`  · ${p.channel} = ${p.version}（本扩展最新只验证到 ${newestVerified(verified)}）`);
      }
      console.log("\n下一步（按此顺序，规范见 docs/02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md）：");
      console.log("  1. 装该版本并起内嵌面板，逐一核对四个破坏面：boot 注入形态 / dist 资产路径 / /api 认证与 RPC / CLI flags");
      console.log("  2. 在 docs/01-Projects/R20260820-01-上游DSH版本适配/ 新增 NN-修复_<dsh版本>-<现象>.md（用缺陷修复记录模板）");
      console.log("  3. 更新 docs/02-Areas/dsh-baseline.json 的 verified，并同步 README.md / README.en.md 兼容矩阵与 CHANGELOG.md");
      console.log("  4. npm test 与真实 dsh 冒烟（scripts/smoke.js）全绿后发版");
    }
  }

  // Set exitCode instead of calling process.exit(): an abrupt exit while the
  // registry connection is still closing trips a libuv assertion on Windows.
  if (strict && pending.length > 0) process.exitCode = 1;
})().catch((err) => {
  console.error("check:dsh FAIL:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
