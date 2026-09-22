// Translating a VS Code explorer drag (or an explorer context-menu selection)
// into DSH's own file-reference text — feature R20260917-01.
//
// WHY THIS LAYER EXISTS
// ---------------------
// DSH already understands `@<workspace-relative path>`: the `dsh-file-reference`
// plugin injects a prompt telling the model that "tokens prefixed with @ are
// workspace paths the user explicitly referenced, relative to the workspace
// root", and neither side reads or attaches the file — the model calls its own
// `read` tool. The `@` picker's chip serializes to exactly that string, so
// writing the text ourselves is byte-identical to picking the file from the
// completion list (verified against dsh 0.1.5-rc.2; see
// docs/01-Projects/R20260917-01-目录树拖拽到Composer/10-事实_DSH-Composer与提及机制.md).
//
// What VS Code hands us is NOT that text. A drag from the explorer carries no
// File objects at all (string-only DataTransfer) and the paths sit in VS Code's
// private mime types (`application/vnd.code.uri-list`, `ResourceURLs`, ...).
// This module turns those payloads into reference text.
//
// Everything here is a pure function (no vscode import) so the grammar is
// locked by unit tests instead of by a manual mouse drag — the same discipline
// the sibling Obsidian project uses for the same feature.
import * as path from "node:path";

export type DropKind = "file" | "folder";

/** One item to reference, already normalized to DSH's view of the workspace. */
export interface DropEntry {
  /** Workspace-relative with forward slashes (DSH resolves references from the workspace root). */
  path: string;
  kind: DropKind;
}

/** A path candidate straight out of a drag payload; file-vs-folder is settled later by a stat. */
export interface DropCandidate {
  path: string;
  /** The source guarantees a file (VS Code's `ResourceURLs` excludes directories). */
  fileOnly: boolean;
}

/** Upper bound on one drop, so a misfired multi-select cannot flood the input box. */
export const MAX_DROP_REFERENCES = 20;

/**
 * Mime types that can carry a droppable path, best first.
 *
 * `application/vnd.code.uri-list` is the only one with the full multi-select
 * list INCLUDING directories; `text/uri-list` carries just the first URI
 * (Chromium drag-data limitation VS Code works around); `ResourceURLs` has all
 * files but no directories; `text/plain` is the label path and the last resort.
 */
export const DROP_MIME_PRIORITY = [
  "application/vnd.code.uri-list",
  "text/uri-list",
  "resourceurls",
  "codefiles",
  "codeeditors",
  "text/plain",
] as const;

/**
 * Whether one code point may appear in a `@` reference.
 *
 * The same set DSH's own `formatFileMention` refuses (C0/C1 controls, DEL and
 * the double quote), written as arithmetic rather than as a character class.
 */
function isWritableCodePoint(cp: number): boolean {
  return cp !== 0x22 && cp >= 0x20 && cp !== 0x7f && !(cp >= 0x80 && cp <= 0x9f);
}

/**
 * A path the prompt grammar cannot represent is SKIPPED rather than escaped:
 * escaping would invent a path that does not exist.
 */
function isWritable(value: string): boolean {
  if (value.length === 0) return false;
  for (const char of value) {
    if (!isWritableCodePoint(char.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

/**
 * One path as DSH reference text, or null when it cannot be represented.
 *
 * @param value - workspace-relative path (`src/a.ts`, `src/utils`).
 * @param kind - folders get a trailing slash, which is upstream's directory token.
 */
export function toReference(value: string, kind: DropKind = "file"): string | null {
  const trimmed = value.trim();
  if (!isWritable(trimmed)) return null;
  const withSlash = kind === "folder" && !trimmed.endsWith("/") ? `${trimmed}/` : trimmed;
  return /\s/u.test(withSlash) ? `@"${withSlash}"` : `@${withSlash}`;
}

/**
 * The prompt text for a set of entries: one reference per item, space-separated
 * (a space is what DSH's `@` tokenizer accepts before `@`; a quoted reference
 * cannot be torn apart by the whitespace inside it).
 */
export function referencesFromEntries(entries: readonly DropEntry[]): string {
  const parts: string[] = [];
  for (const entry of entries.slice(0, MAX_DROP_REFERENCES)) {
    const reference = toReference(entry.path, entry.kind);
    if (reference !== null) parts.push(reference);
  }
  return parts.join(" ");
}

/** Forward slashes everywhere: DSH references are POSIX-shaped on every OS. */
export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** Comparison key for one path (Windows paths are case-insensitive). */
export function pathKey(value: string): string {
  const normalized = toPosixPath(value).replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * The reference path for `absPath` as seen from the workspace root DSH runs in.
 *
 * Inside the workspace: workspace-relative (what DSH resolves). Outside: the
 * absolute path is kept — a visibly degraded but honest reference instead of a
 * silently dropped one.
 */
export function workspaceRelative(absPath: string, root: string): string {
  const abs = toPosixPath(absPath);
  const base = toPosixPath(root).replace(/\/+$/, "");
  if (base.length > 0) {
    const prefix = pathKey(base) + "/";
    if (pathKey(abs).startsWith(prefix)) return abs.slice(base.length + 1);
  }
  return abs;
}

/**
 * `file:///d%3A/code/x.ts#L3,5` -> `d:/code/x.ts`. Returns null for anything
 * that is not a `file:` URI (remote/untitled resources are not references).
 */
export function fileUriToPath(uri: string): string | null {
  const raw = uri.trim().split("#")[0];
  if (!/^file:/i.test(raw)) return null;
  let body: string;
  if (/^file:\/\/\//i.test(raw)) body = raw.slice("file://".length); // -> "/d:/code/x.ts"
  else if (/^file:\/\//i.test(raw)) body = `/${raw.slice("file://".length)}`; // UNC
  else body = raw.slice("file:".length);
  try {
    body = decodeURIComponent(body);
  } catch {
    /* keep the raw text: a malformed escape still identifies a path */
  }
  if (/^\/[a-zA-Z]:/.test(body)) body = body.slice(1); // "/d:/x" -> "d:/x"
  if (body.length === 0 || /^\/+$/.test(body)) return null; // "file:///" is a root, not a file
  return body;
}

/** Split an RFC-2483-ish URI list (one per line, `#` starts a comment). */
function splitUriList(raw: string): string[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * The `file:` URIs in one `text/uri-list` payload, in order.
 *
 * This is the payload VS Code hands a `TreeDragAndDropController` when the user
 * drags resources out of the explorer (`@types/vscode`: "Use `text/uri-list` for
 * resources dropped from the explorer or other tree views in the workbench"), so
 * it is the one place a *native* drop enters this pipeline — no webview, and
 * therefore none of the iframe drag blocking.
 */
export function fileUrisFromUriList(raw: string): string[] {
  const out: string[] = [];
  for (const line of splitUriList(raw)) {
    const withoutFragment = line.split("#")[0];
    if (/^file:/i.test(withoutFragment) && fileUriToPath(withoutFragment) !== null) {
      out.push(withoutFragment);
    }
  }
  return out;
}

function candidatesFromUriList(raw: string, fileOnly: boolean): DropCandidate[] {
  const out: DropCandidate[] = [];
  for (const line of splitUriList(raw)) {
    const parsed = fileUriToPath(line);
    if (parsed !== null) out.push({ path: parsed, fileOnly });
  }
  return out;
}

/** `ResourceURLs` / `CodeFiles`: a JSON array of file URIs or of plain fs paths. */
function candidatesFromJsonArray(raw: string, fileOnly: boolean): DropCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: DropCandidate[] = [];
  for (const item of parsed) {
    if (typeof item !== "string" || item.length === 0) continue;
    const resolved = /^file:/i.test(item) ? fileUriToPath(item) : item;
    if (resolved !== null) out.push({ path: resolved, fileOnly });
  }
  return out;
}

/**
 * `CodeEditors`: VS Code's internal `stringify()`-ed editor descriptors. Not a
 * documented contract, so several shapes are accepted and anything else is
 * ignored rather than guessed.
 */
function candidatesFromCodeEditors(raw: string): DropCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: DropCandidate[] = [];
  for (const item of parsed) {
    const resource = (item as { resource?: unknown } | null)?.resource;
    let value: string | undefined;
    if (typeof resource === "string") {
      value = resource;
    } else if (resource !== null && typeof resource === "object") {
      const r = resource as { scheme?: unknown; path?: unknown; external?: unknown };
      if (typeof r.external === "string") value = r.external;
      else if (typeof r.path === "string" && r.scheme === "file") value = `file://${r.path}`;
    }
    if (value === undefined || value.length === 0) continue;
    const resolved = /^file:/i.test(value) ? fileUriToPath(value) : value;
    if (resolved !== null) out.push({ path: resolved, fileOnly: false });
  }
  return out;
}

/**
 * `text/plain`: VS Code's URI label — workspace-relative inside the workspace,
 * absolute outside, one line per selected item. No protocol information, so it
 * is only ever a candidate and the host still has to stat it.
 */
function candidatesFromPlainText(raw: string): DropCandidate[] {
  const out: DropCandidate[] = [];
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) out.push({ path: trimmed, fileOnly: false });
  }
  return out;
}

function parseMime(mime: string, raw: string): DropCandidate[] {
  switch (mime) {
    case "application/vnd.code.uri-list":
    case "text/uri-list":
      return candidatesFromUriList(raw, false);
    case "resourceurls":
      return candidatesFromJsonArray(raw, true);
    case "codefiles":
      return candidatesFromJsonArray(raw, false);
    case "codeeditors":
      return candidatesFromCodeEditors(raw);
    case "text/plain":
      return candidatesFromPlainText(raw);
    default:
      return [];
  }
}

/**
 * Every path candidate a raw drag payload carries, deduplicated.
 *
 * All matching mime types are read, not just the best one: VS Code's data is
 * split across several keys (directories only in the uri-list, the full file
 * list only in `ResourceURLs`) and losing a file the user dragged is the kind of
 * error nobody can see. Duplicates collapse by path key.
 */
export function candidatesFromPayload(payload: Readonly<Record<string, unknown>> | undefined): DropCandidate[] {
  if (payload === null || typeof payload !== "object") return [];
  // Mime keys are matched case-insensitively: the spec lowercases formats, VS
  // Code writes `ResourceURLs` / `CodeFiles` with capitals.
  const byLower = new Map<string, string>();
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.length > 0) byLower.set(key.toLowerCase(), value);
  }
  const out: DropCandidate[] = [];
  for (const mime of DROP_MIME_PRIORITY) {
    const raw = byLower.get(mime);
    if (raw === undefined) continue;
    out.push(...parseMime(mime, raw));
  }
  const seen = new Set<string>();
  const unique: DropCandidate[] = [];
  for (const candidate of out) {
    const key = pathKey(candidate.path);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

/** How the host decides file-vs-folder: undefined = the path does not exist. */
export type StatKind = (absPath: string) => Promise<DropKind | undefined>;

/**
 * Turn candidates into reference entries: resolve relative paths against the
 * workspace root, stat each one (a path we cannot stat is dropped — referencing
 * a file that is not there is worse than skipping it), relativize, cap.
 */
export async function entriesFromCandidates(
  candidates: readonly DropCandidate[],
  root: string,
  stat: StatKind
): Promise<DropEntry[]> {
  const entries: DropEntry[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (entries.length >= MAX_DROP_REFERENCES) break;
    const abs = path.isAbsolute(candidate.path) ? candidate.path : path.join(root, candidate.path);
    let kind: DropKind | undefined;
    try {
      kind = await stat(abs);
    } catch {
      kind = undefined;
    }
    // A stat failure on a source that can only carry files still resolves to a
    // file: VS Code excluded the directories for us.
    if (kind === undefined) {
      if (!candidate.fileOnly) continue;
      kind = "file";
    }
    const relative = workspaceRelative(abs, root);
    const key = pathKey(relative);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    entries.push({ path: relative, kind });
  }
  return entries;
}
