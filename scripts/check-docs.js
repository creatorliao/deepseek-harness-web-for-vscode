// Documentation contract check (`npm run check:docs`).
//
// WHY THIS EXISTS (2026-09-17, feature R20260917-01): a topic folder was
// written with its evidence documents (分析/事实) numbered BEFORE the pipeline
// stages, which pushed 方案 to 06 and broke the "03-方案 / 04-实施计划 / 05-验证"
// convention every other topic folder follows. A cross-topic link was also
// written with one `../` too many. Both are mechanical errors that nothing
// caught at the time — this script is the guard.
//
// RULES (derived from the existing folders, not invented):
//   R1  Every numbered `.md` in a typed project folder is `NN-类型_名称.md`
//       with 类型 from the fixed vocabulary.
//   R2  Numbers run 01..N without gaps.
//   R3  In a PIPELINE folder (>= 3 distinct pipeline stage types), evidence
//       documents (事实/分析/评审/修复/事件/架构提案/教程) must come AFTER the
//       last pipeline stage — never between them.
//   R4  Every relative markdown link resolves.
//   R5  Every `01-Projects/R*` topic folder has a `00-README.md`.
//
// "Typed" folder = contains at least one `NN-类型_名称.md`. This keeps the
// free-form folders (R20260914-01-演进总览: 01-演进时间线.md, 02-路线图.md …)
// out of scope instead of pretending they follow a naming rule they never had.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const PROJECTS = path.join(DOCS, "01-Projects");

/** Type words allowed in a topic folder name (文档与PARA规范 §7). */
const TYPES = new Set([
  "讨论",
  "需求",
  "方案",
  "实施计划",
  "验证",
  "总结",
  "待办",
  "事实",
  "修复",
  "分析",
  "评审",
  "事件",
  "架构提案",
  "教程",
]);

/** The pipeline stages; a folder with >= 3 of them is a pipeline folder (R3). */
const PIPELINE_TYPES = new Set(["讨论", "需求", "方案", "实施计划", "验证", "总结", "待办"]);

/** `NN-类型_名称.md` (the `名称` part may contain underscores and dashes). */
const NAME_RE = /^(\d{2})-([^_]+)_(.+)\.md$/;

const problems = [];

function walkMarkdown(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** R4 — every relative `.md` link must point at a file that exists. */
function checkLinks(file) {
  const text = fs.readFileSync(file, "utf8");
  const base = path.dirname(file);
  // Bare relative links (`01-需求_x.md`) count too — only absolute paths,
  // anchors and real URLs are out of scope. Placeholder targets in the record
  // TEMPLATES (`[分析文档](NN-分析_….md)`, `<一句话现象>`) are not links to a
  // file, so they are skipped rather than reported forever.
  for (const match of text.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
    const target = match[1];
    if (target.includes("://") || target.startsWith("#") || target.startsWith("/")) continue;
    if (/[…<>]/.test(target)) continue;
    if (!fs.existsSync(path.resolve(base, target))) {
      problems.push(`${rel(file)}: broken link -> ${target}`);
    }
  }
}

/** R1/R2/R3/R5 — the naming and ordering contract of a topic folder. */
function checkTopicFolder(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
  if (!files.some((f) => f.name === "00-README.md")) {
    problems.push(`${rel(dir)}: missing 00-README.md (R5)`);
  }

  const numbered = [];
  for (const file of files) {
    if (!file.name.endsWith(".md") || file.name === "00-README.md") continue;
    const match = NAME_RE.exec(file.name);
    if (!match) {
      // Only a problem once the folder is clearly "typed" (see header note).
      numbered.push({ untyped: file.name });
      continue;
    }
    const [, number, type] = match;
    if (!TYPES.has(type)) {
      problems.push(`${rel(dir)}/${file.name}: unknown type "${type}" (R1)`);
    }
    numbered.push({ number: Number(number), type, name: file.name });
  }

  const typed = numbered.filter((f) => !f.untyped);
  if (typed.length === 0) return; // free-form folder: out of scope

  for (const entry of numbered.filter((f) => f.untyped)) {
    problems.push(`${rel(dir)}/${entry.untyped}: expected NN-类型_名称.md (R1)`);
  }

  const numbers = typed.map((f) => f.number).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) {
      problems.push(
        `${rel(dir)}: numbering must run 01..N without gaps, saw ${numbers.join(",")} (R2)`
      );
      break;
    }
  }

  const stages = typed.filter((f) => PIPELINE_TYPES.has(f.type));
  const distinctStages = new Set(stages.map((f) => f.type));
  if (distinctStages.size >= 3) {
    const lastStage = Math.max(...stages.map((f) => f.number));
    for (const entry of typed) {
      if (!PIPELINE_TYPES.has(entry.type) && entry.number < lastStage) {
        problems.push(
          `${rel(dir)}/${entry.name}: evidence documents (${entry.type}) must be numbered ` +
            `after the last pipeline stage (${lastStage}) (R3)`
        );
      }
    }
  }
}

function rel(target) {
  return path.relative(ROOT, target).replace(/\\/g, "/");
}

// R4 — every document in the knowledge base, not just topic folders.
for (const file of walkMarkdown(DOCS)) checkLinks(file);

// R1/R2/R3/R5 — every topic folder (the overview folder is free-form by design).
for (const entry of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  checkTopicFolder(path.join(PROJECTS, entry.name));
}

if (problems.length > 0) {
  console.error(`[check:docs] ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("[check:docs] OK — 命名/编号/证据顺序/相对链接 全部合规");
