// Which surface the DSH UI opens in (setting `deepseekHarness.openTarget`).
// Pure and vscode-free so it stays unit-testable; the default is the
// secondary-side-bar view, because the extension's point is to live in the
// editor without taking it over.
export type OpenTarget = "sidebar" | "editorTab";

/**
 * Default surface: the right-hand **side panel** (the Secondary Side Bar view).
 *
 * That is the Cursor-like surface the user actually works in: you type there
 * while the editor keeps showing your files, so opening DSH never covers what
 * you are reading. The editor-tab surface still exists — it is the wide one —
 * but it is opt-in via the button in the launcher or `openTarget: "editorTab"`.
 */
export const DEFAULT_OPEN_TARGET: OpenTarget = "sidebar";

/** vscode.ViewColumn.Beside */
const VIEW_COLUMN_BESIDE = -2;

/**
 * Which editor column the DSH UI should open in so it lands on the RIGHT.
 *
 * With a single group there is nothing to the right yet, so `Beside` creates
 * one (that is the "always on the right" behaviour); with several, dock into
 * the rightmost that already exists — returning `Beside` every time would spawn
 * a brand-new group on each open.
 *
 * Pure and vscode-free: callers pass `vscode.window.tabGroups.all`.
 */
export function columnForRightSide(groups: readonly { viewColumn: number }[]): number {
  if (groups.length <= 1) return VIEW_COLUMN_BESIDE;
  return Math.max(...groups.map((g) => g.viewColumn));
}

/**
 * Resolve the configured open target. ANY unrecognized value (including
 * undefined from an older workspace settings file) falls back to the default
 * rather than throwing — a bad setting must never break opening the UI.
 *
 * Note: both valid values are matched explicitly, so flipping
 * DEFAULT_OPEN_TARGET can never disable the other one (it did once: the check
 * was written as `value === "sidebar"`, which made "editorTab" unreachable the
 * moment the default became "sidebar" — the unit test caught it).
 */
export function resolveOpenTarget(value: string | undefined): OpenTarget {
  return value === "editorTab" || value === "sidebar" ? value : DEFAULT_OPEN_TARGET;
}

/** View container id contributed under `viewsContainers.secondarySidebar`. */
export const CHAT_VIEW_CONTAINER = "deepseek-harness-chat";

/**
 * Command VS Code auto-registers for a contributed view container. Focusing it
 * opens the part (if hidden), shows THIS container and focuses it — unlike
 * `workbench.action.toggleAuxiliaryBar`, which only toggles the whole part and
 * may reveal a different container the user left there.
 */
export const FOCUS_CHAT_VIEW_COMMAND = `workbench.view.extension.${CHAT_VIEW_CONTAINER}`;

/**
 * VS Code also auto-registers `<viewId>.focus` for every contributed view.
 * Used as a second attempt when the container command did not produce a live
 * view (a moved view, or a host that handles container focus differently).
 */
export const CHAT_VIEW_ID = "deepseek-harness.chatView";
export const FOCUS_CHAT_VIEW_ITEM_COMMAND = `${CHAT_VIEW_ID}.focus`;
