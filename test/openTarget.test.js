// Unit tests for src/openTarget.ts — the surface router added with the
// secondary-side-bar view (Q5). The container id is cross-checked against
// package.json, because a rename in one place only would silently break
// "reveal the side bar" with no type error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CHAT_VIEW_CONTAINER,
  CHAT_VIEW_ID,
  DEFAULT_OPEN_TARGET,
  FOCUS_CHAT_VIEW_COMMAND,
  FOCUS_CHAT_VIEW_ITEM_COMMAND,
  columnForRightSide,
  resolveOpenTarget,
} from "../out/openTarget.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("resolveOpenTarget: defaults to the right-hand side panel", () => {
  // The panel is the surface you type in without the UI covering the editor;
  // the editor tab is the opt-in wide surface.
  assert.equal(DEFAULT_OPEN_TARGET, "sidebar");
  assert.equal(resolveOpenTarget(undefined), "sidebar");
  assert.equal(resolveOpenTarget("sidebar"), "sidebar");
});

test("resolveOpenTarget: editorTab is opt-in", () => {
  assert.equal(resolveOpenTarget("editorTab"), "editorTab");
});

test("resolveOpenTarget: unrecognized values fall back instead of throwing", () => {
  // A stale or hand-edited settings.json must never break opening the UI.
  for (const bad of ["", "SIDEBAR", "side", "bar", " editorTab ", "0"]) {
    assert.equal(resolveOpenTarget(bad), "sidebar", `value ${JSON.stringify(bad)}`);
  }
});

test("columnForRightSide: creates a right group when only one exists", () => {
  // Beside (-2): with nothing to the right yet, that is what puts the panel on
  // the right instead of replacing the editor you were looking at.
  assert.equal(columnForRightSide([]), -2);
  assert.equal(columnForRightSide([{ viewColumn: 1 }]), -2);
});

test("columnForRightSide: docks into the existing rightmost group", () => {
  // Returning Beside here would spawn a brand-new group on every open.
  assert.equal(columnForRightSide([{ viewColumn: 1 }, { viewColumn: 2 }]), 2);
  assert.equal(columnForRightSide([{ viewColumn: 3 }, { viewColumn: 1 }]), 3);
});

test("FOCUS_CHAT_VIEW_COMMAND targets the contributed container", () => {
  assert.equal(FOCUS_CHAT_VIEW_COMMAND, `workbench.view.extension.${CHAT_VIEW_CONTAINER}`);
  // VS Code derives the view-level focus command from the view id.
  assert.equal(FOCUS_CHAT_VIEW_ITEM_COMMAND, `${CHAT_VIEW_ID}.focus`);

  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const containers = pkg.contributes?.viewsContainers?.secondarySidebar ?? [];
  const ids = containers.map((c) => c.id);
  assert.ok(
    ids.includes(CHAT_VIEW_CONTAINER),
    `package.json must contribute a secondarySidebar container named ${CHAT_VIEW_CONTAINER} (found: ${ids.join(", ") || "none"})`
  );

  // The view must be declared under the container id, not under the
  // `workbench.view.extension.` prefixed command id, and its id must match the
  // one the focus command is derived from.
  const views = pkg.contributes?.views?.[CHAT_VIEW_CONTAINER] ?? [];
  assert.ok(
    views.some((v) => v.type === "webview" && v.id === CHAT_VIEW_ID),
    `the chat container must declare the webview view ${CHAT_VIEW_ID} (found: ${views.map((v) => v.id).join(", ") || "none"})`
  );
});

test("package.json requires a VS Code version that supports secondarySidebar", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const min = Number(String(pkg.engines?.vscode ?? "").replace(/^[^0-9]*/, "").split(".")[0]);
  const minor = Number(String(pkg.engines?.vscode ?? "").split(".")[1] ?? 0);
  assert.ok(
    min > 1 || (min === 1 && minor >= 100),
    `secondarySidebar needs VS Code >= 1.100, but engines.vscode is ${pkg.engines?.vscode}`
  );
});
