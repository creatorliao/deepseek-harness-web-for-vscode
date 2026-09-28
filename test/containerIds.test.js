// Container-id freeze (feature R20260929-01, from VOC20260929-01).
//
// WHY THIS EXISTS: on 2026-09-14 the extension's view-container ids were renamed
// from `dsh` / `dsh-panel` to `deepseek-harness` / `deepseek-harness-chat`. VS
// Code keeps a *pinned* container in the activity bar even after the extension
// stops contributing that id — it becomes a placeholder with no icon. Real
// evidence on the reporter's machine (state.vscdb, 2026-09-29): both legacy ids
// were still pinned and rendered as icon-less "DeepSeek Harness" entries, and
// there is NO command to remove them (`workbench.action.pinView` / `unpinView` /
// `removePinnedViewlet` all absent from the 1.105.1 bundle).
//
// So the ids below are FROZEN. Changing one is not a rename, it is a new orphan
// on every machine that pinned the old one. If a change is ever truly needed,
// ship a compatibility plan for the old pin first and update this list in the
// same commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

/** The frozen container ids, per location. */
const FROZEN = {
  activitybar: ["deepseek-harness"],
  secondarySidebar: ["deepseek-harness-chat"],
};

const RENAME_HINT =
  "容器 id 一旦发布就被冻结：改它会在老用户机器上留下一个没有图标、也删不掉的孤儿条目" +
  "（VS Code 无移除命令，见本文件顶部注释）。确需变更时先给出旧 pin 的兼容方案，并在同一次提交里更新本清单。";

test("viewsContainers: container ids are frozen", () => {
  const containers = pkg.contributes?.viewsContainers ?? {};
  for (const [location, expected] of Object.entries(FROZEN)) {
    const actual = (containers[location] ?? []).map((c) => c.id);
    assert.deepEqual(actual, expected, `${location} 的容器 id 变了。${RENAME_HINT}`);
  }
});

test("viewsContainers: no legacy container id is contributed back", () => {
  // Re-contributing the old ids would NOT remove the orphan pins — it would
  // resolve them into a third and fourth visible icon instead. Guard against it.
  const all = Object.values(pkg.contributes?.viewsContainers ?? {}).flat();
  const ids = all.map((c) => c.id);
  for (const legacy of ["dsh", "dsh-panel"]) {
    assert.ok(!ids.includes(legacy), `不要再贡献旧容器 id "${legacy}"：那只会把孤儿 pin 变成可见图标，见 02-方案 §2 F1`);
  }
});

test("viewsContainers: the two containers are distinguishable", () => {
  // Before R20260929-01 both had title "DeepSeek Harness" and icon
  // media/icon.svg, so the hover text could not tell them apart.
  const bar = pkg.contributes.viewsContainers.activitybar[0];
  const side = pkg.contributes.viewsContainers.secondarySidebar[0];
  assert.notEqual(bar.title, side.title, "两个容器的 title 不能相同");
  assert.notEqual(bar.icon, side.icon, "两个容器的 icon 不能指向同一个文件");
});

test("views.explorer: the drop strip is gated by a setting", () => {
  // R20260929-01 R2: the strip is injected into the BUILT-IN explorer container,
  // so an unconditional contribution means the user can never get rid of it.
  const views = pkg.contributes?.views?.explorer ?? [];
  const drop = views.find((v) => v.id === "deepseek-harness.contextDrop");
  assert.ok(drop, "explorer 容器里应有 deepseek-harness.contextDrop");
  assert.equal(
    drop.when,
    "config.deepseekHarness.showContextDrop",
    "投放条必须由设置控制可见性，且 when 需指向同一个配置键"
  );
  const prop = pkg.contributes?.configuration?.properties?.["deepseekHarness.showContextDrop"];
  assert.ok(prop, "configuration 里应有 deepseekHarness.showContextDrop");
  assert.equal(prop.type, "boolean");
  // Default ON: turning it off by default would break the entry for everyone
  // already using it (AGENTS.md §7.1 对内原则).
  assert.equal(prop.default, true);
});
