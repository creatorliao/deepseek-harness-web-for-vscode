// Unit tests for src/referenceDrop.ts — the drag/menu -> `@reference` grammar
// (R20260917-01). These lock the exact prompt text DSH expects, so a broken
// grammar is caught here instead of after a mouse drag.
//
// The syntax mirrors upstream `dsh-file-reference`'s `formatFileMention`: plain
// `@path`, `@"path with spaces"`, a trailing slash for directories, one space
// between references, and a hard cap per drop.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DROP_REFERENCES,
  candidatesFromPayload,
  entriesFromCandidates,
  fileUriToPath,
  referencesFromEntries,
  toReference,
  workspaceRelative,
} from "../out/referenceDrop.js";

const ROOT = process.platform === "win32" ? "D:\\code\\proj" : "/code/proj";
const file = (p) => ({ path: p, kind: "file" });
const folder = (p) => ({ path: p, kind: "folder" });

test("toReference: plain, spaced and directory forms match DSH's grammar", () => {
  assert.equal(toReference("src/a.ts"), "@src/a.ts");
  assert.equal(toReference("src/my notes.md"), '@"src/my notes.md"');
  assert.equal(toReference("src/utils", "folder"), "@src/utils/");
  assert.equal(toReference("src/my utils", "folder"), '@"src/my utils/"');
  // Already-slashed folders are not double-slashed.
  assert.equal(toReference("src/utils/", "folder"), "@src/utils/");
});

test("toReference: a path the grammar cannot carry is skipped, not escaped", () => {
  // A `"` would have to be escaped, and escaping invents a path that does not
  // exist on disk — skipping is visible, escaping is a lie.
  assert.equal(toReference('odd"name.md'), null);
  assert.equal(toReference("ctrl\u0001name.md"), null);
  assert.equal(toReference(""), null);
  assert.equal(toReference("   "), null);
});

test("referencesFromEntries: one reference per item, space separated, capped", () => {
  assert.equal(
    referencesFromEntries([file("src/a.ts"), folder("src/utils"), file("my notes.md")]),
    '@src/a.ts @src/utils/ @"my notes.md"'
  );
  const many = Array.from({ length: MAX_DROP_REFERENCES + 5 }, (_v, i) => file(`src/f${i}.ts`));
  const refs = referencesFromEntries(many).split(" ");
  assert.equal(refs.length, MAX_DROP_REFERENCES);
  assert.equal(refs[0], "@src/f0.ts");
});

test("referencesFromEntries: unwritable entries are dropped without losing the rest", () => {
  assert.equal(referencesFromEntries([file('bad"name'), file("good.ts")]), "@good.ts");
});

test("fileUriToPath: decodes VS Code's file URIs (and strips a line fragment)", () => {
  assert.equal(fileUriToPath("file:///d%3A/code/proj/src/a.ts"), "d:/code/proj/src/a.ts");
  assert.equal(fileUriToPath("file:///d%3A/code/a.ts#L3,5"), "d:/code/a.ts");
  assert.equal(fileUriToPath("file:///home/me/my%20notes.md"), "/home/me/my notes.md");
  assert.equal(fileUriToPath("file:///"), null);
  // Non-file schemes are not references.
  assert.equal(fileUriToPath("untitled:Untitled-1"), null);
  assert.equal(fileUriToPath("vscode-remote://ssh/x"), null);
});

test("candidatesFromPayload: every source contributes (dedupe happens after resolution)", () => {
  const candidates = candidatesFromPayload({
    // Mixed case on purpose: VS Code writes `ResourceURLs`, not `resourceurls`.
    "application/vnd.code.uri-list": "file:///d%3A/code/proj/src/a.ts\r\nfile:///d%3A/code/proj/src/b.ts",
    ResourceURLs: JSON.stringify(["file:///d%3A/code/proj/src/a.ts"]),
    "text/plain": "src/a.ts\r\nsrc/b.ts",
  });
  const paths = candidates.map((c) => c.path).sort();
  // The URI forms collapse together; the label form is a different string at
  // this stage and only collapses once both resolve to the same file on disk
  // (see the entriesFromCandidates dedupe test).
  assert.deepEqual(paths, [
    "d:/code/proj/src/a.ts",
    "d:/code/proj/src/b.ts",
    "src/a.ts",
    "src/b.ts",
  ]);
});

test("candidatesFromPayload: multi-select is never truncated to the first URI", () => {
  // `text/uri-list` only ever carries the first URI (Chromium drag-data limit),
  // which is why `ResourceURLs` and the internal uri-list are read as well.
  const candidates = candidatesFromPayload({
    "text/uri-list": "file:///d%3A/code/proj/one.ts",
    resourceurls: JSON.stringify([
      "file:///d%3A/code/proj/one.ts",
      "file:///d%3A/code/proj/two.ts",
      "file:///d%3A/code/proj/three.ts",
    ]),
  });
  assert.equal(candidates.length, 3);
});

test("candidatesFromPayload: uri-list comments and blank lines are ignored", () => {
  const candidates = candidatesFromPayload({
    "application/vnd.code.uri-list": "# comment\r\n\r\nfile:///d%3A/code/proj/a.ts",
  });
  assert.deepEqual(candidates.map((c) => c.path), ["d:/code/proj/a.ts"]);
});

test("candidatesFromPayload: CodeEditors and CodeFiles shapes are tolerated", () => {
  const candidates = candidatesFromPayload({
    codefiles: JSON.stringify(["D:\\code\\proj\\src\\a.ts"]),
    codeeditors: JSON.stringify([
      { resource: "file:///d%3A/code/proj/src/b.ts" },
      { resource: { scheme: "file", path: "/d:/code/proj/src/c.ts" } },
      { resource: { scheme: "untitled", path: "/Untitled-1" } },
      { nothing: true },
    ]),
  });
  assert.deepEqual(
    candidates.map((c) => c.path).sort(),
    ["D:\\code\\proj\\src\\a.ts", "d:/code/proj/src/b.ts", "d:/code/proj/src/c.ts"]
  );
});

test("candidatesFromPayload: junk payloads yield nothing instead of throwing", () => {
  assert.deepEqual(candidatesFromPayload({}), []);
  assert.deepEqual(candidatesFromPayload({ resourceurls: "not json" }), []);
  assert.deepEqual(candidatesFromPayload({ resourceurls: JSON.stringify([1, null]) }), []);
  assert.deepEqual(candidatesFromPayload(undefined), []);
});

test("workspaceRelative: inside the workspace becomes relative, outside stays absolute", () => {
  const inside = process.platform === "win32" ? "D:\\code\\proj\\src\\a.ts" : "/code/proj/src/a.ts";
  const outside = process.platform === "win32" ? "D:\\other\\b.ts" : "/other/b.ts";
  assert.equal(workspaceRelative(inside, ROOT), "src/a.ts");
  assert.equal(workspaceRelative(outside, ROOT), outside.replace(/\\/g, "/"));
});

test("workspaceRelative: a sibling folder with the same prefix is not mistaken for a child", () => {
  const sibling = process.platform === "win32" ? "D:\\code\\proj-other\\a.ts" : "/code/proj-other/a.ts";
  assert.equal(workspaceRelative(sibling, ROOT), sibling.replace(/\\/g, "/"));
});

test("workspaceRelative: Windows paths compare case-insensitively", { skip: process.platform !== "win32" }, () => {
  assert.equal(workspaceRelative("d:\\CODE\\PROJ\\src\\a.ts", ROOT), "src/a.ts");
});

test("entriesFromCandidates: relative candidates resolve against the root and are stat'ed", async () => {
  const stat = async (abs) => (abs.replace(/\\/g, "/").endsWith("src/utils") ? "folder" : "file");
  const entries = await entriesFromCandidates(
    [{ path: "src/a.ts", fileOnly: false }, { path: "src/utils", fileOnly: false }],
    ROOT,
    stat
  );
  assert.deepEqual(entries, [
    { path: "src/a.ts", kind: "file" },
    { path: "src/utils", kind: "folder" },
  ]);
  assert.equal(referencesFromEntries(entries), "@src/a.ts @src/utils/");
});

test("entriesFromCandidates: an unresolvable path is skipped", async () => {
  const stat = async () => undefined;
  assert.deepEqual(await entriesFromCandidates([{ path: "ghost.ts", fileOnly: false }], ROOT, stat), []);
  // …unless the source can only ever carry files (ResourceURLs excludes dirs).
  assert.deepEqual(await entriesFromCandidates([{ path: "ghost.ts", fileOnly: true }], ROOT, stat), [
    { path: "ghost.ts", kind: "file" },
  ]);
});

test("entriesFromCandidates: duplicates collapse after resolution", async () => {
  const stat = async () => "file";
  const absolute = process.platform === "win32" ? "D:/code/proj/src/a.ts" : "/code/proj/src/a.ts";
  // The same file reaches us both as an absolute path (from a URI) and as a
  // workspace-relative label (from text/plain) — one reference, not two.
  const entries = await entriesFromCandidates(
    [{ path: absolute, fileOnly: false }, { path: "src/a.ts", fileOnly: false }],
    ROOT,
    stat
  );
  assert.deepEqual(entries, [{ path: "src/a.ts", kind: "file" }]);
});
