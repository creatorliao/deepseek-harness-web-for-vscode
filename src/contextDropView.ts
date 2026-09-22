// The "drop strip" — a NATIVE TreeView that accepts files dragged out of the
// explorer, contributed into the built-in Explorer container so it sits right
// under the file tree the user is dragging from.
//
// WHY A TREE AND NOT THE WEBVIEW (2026-09-17, measured): VS Code sets
// `pointer-events: none` on every webview iframe for the duration of any
// in-window drag, and only lifts it while Shift is held — so the DSH panel
// (editor tab or secondary sidebar, both are iframes) cannot receive an explorer
// drag by itself. A tree view is not an iframe: the workbench hands the drop to
// the extension host directly through `TreeDragAndDropController`, no modifier
// key, no cross-origin boundary. Root-cause write-up:
// docs/01-Projects/R20260917-01-目录树拖拽到Composer/12-分析_入口可达性与拖拽可达性.md
import * as vscode from "vscode";
import { t } from "./i18n.js";
import { fileUrisFromUriList } from "./referenceDrop.js";

/** One row: the drop target itself (there is nothing else in this view). */
interface DropItem {
  readonly id: string;
}

const TARGET: DropItem = { id: "target" };

/**
 * `text/uri-list` is what VS Code writes for resources dragged from the
 * explorer; the value is `toString()`ed Uris separated by `\r\n`.
 */
class ContextDropController implements vscode.TreeDragAndDropController<DropItem> {
  readonly dropMimeTypes = ["text/uri-list"];
  readonly dragMimeTypes: string[] = [];

  constructor(private readonly onDrop: (uris: readonly vscode.Uri[]) => void) {}

  handleDrop(_target: DropItem | undefined, dataTransfer: vscode.DataTransfer): void {
    const item = dataTransfer.get("text/uri-list");
    if (!item) return;
    void Promise.resolve(item.asString()).then((raw) => {
      const uris = fileUrisFromUriList(raw).map((uri) => vscode.Uri.parse(uri));
      if (uris.length > 0) this.onDrop(uris);
    });
  }
}

export class ContextDropView implements vscode.TreeDataProvider<DropItem> {
  /** View id contributed under the built-in `explorer` container. */
  public static readonly viewId = "deepseek-harness.contextDrop";

  private readonly changed = new vscode.EventEmitter<DropItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  /** Last outcome, shown as the row description ("" = the neutral hint). */
  private status = "";

  constructor(private readonly onDrop: (uris: readonly vscode.Uri[]) => void) {}

  /** Create the view; the caller owns the returned disposable. */
  register(): vscode.Disposable {
    const view = vscode.window.createTreeView(ContextDropView.viewId, {
      treeDataProvider: this,
      // A drop-only strip: no selection semantics, and it must stay visible
      // while the user drags over it.
      canSelectMany: false,
      showCollapseAll: false,
      dragAndDropController: new ContextDropController((uris) => this.handleDrop(uris)),
    });
    return view;
  }

  private handleDrop(uris: readonly vscode.Uri[]): void {
    this.onDrop(uris);
    this.status = t("contextDrop.dropped", { count: String(uris.length) });
    this.changed.fire(TARGET);
  }

  getChildren(element?: DropItem): DropItem[] {
    return element ? [] : [TARGET];
  }

  getTreeItem(element: DropItem): vscode.TreeItem {
    const item = new vscode.TreeItem(t("contextDrop.label"), vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.iconPath = new vscode.ThemeIcon("add");
    item.description = this.status;
    item.tooltip = new vscode.MarkdownString(t("contextDrop.tooltip"));
    // Clicking the row is the mouse equivalent of the keybinding: add the file
    // being edited. Dropping is handled by the drag controller above.
    item.command = {
      command: "deepseek-harness-for-vscode.addToContext",
      title: t("contextDrop.label"),
    };
    return item;
  }
}
