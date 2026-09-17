# 事实：Webview 内接收「资源管理器拖拽文件」能力核实

**日期**: 2026-09-17 ｜ **状态**: 当前 ｜ **性质**: 读源码 + 编译产物核对（**未做 GUI 实测**）
**定位**: 回答"VS Code 的 webview 能不能收到资源管理器拖来的文件路径"，是特性 R20260917-01 的方案依据。
**核实环境**: 本机 VS Code **1.105.1**（`D:\Users\liaohai1\AppData\Local\Programs\Microsoft VS Code\`）、仓库内 `@types/vscode` 1.105.0、GitHub 上 `microsoft/vscode` 1.92.2 / 1.93.0 / 1.105.1 源码。**未做 GUI 实测**，凡未经观测的推断均标注。

## 结论（TL;DR）

1. **会触发，但有硬条件。** VS Code 在窗口内任何 `dragstart`（从资源管理器拖文件即属此类）时把 webview iframe 置为 `pointer-events:none`，此时 webview 内部**收不到任何 drag/drop 事件**，文件被 VS Code 自己处理（在编辑器区打开）。只有**按住 Shift** 时 `webviewWindowDragMonitor` 才调用 `windowDidDragEnd()` 恢复指针事件，此时 `dragenter/dragover/drop` 才会进入你的 DOM。
2. **`dataTransfer.files` 在资源管理器拖拽时为空**（VS Code 只写字符串项，不产生 File item），所以 `file.path` / `webkitGetAsEntry()` 这条常用路线对 Explorer 拖拽无效。路径只能从 `text/uri-list`（**仅第一个** URI）、`application/vnd.code.uri-list`（完整、含目录）、`ResourceURLs`（JSON、仅文件）、`CodeEditors`、`text/plain`（标签路径）里取。
3. **没有任何官方 API 把 webview 的 drop 结果送到扩展宿主。** 官方相关 API 只有编辑器的 `DocumentDropEditProvider` 和树的 `TreeDragAndDropController`。
4. 侧边栏 WebviewView 与编辑器 WebviewPanel 在源码层面**没有** drop 行为差异（View 只是额外把部分 drag 事件重派发到容器）。
5. **风险很高**：microsoft/vscode#237958（1.96.3，open，`bug`+`webview` 标签）报告"即使用 Shift 也捕获不到"。建议把「Explorer→webview 拖拽」做成增强路径，**可靠入口另设**（见文末建议）。

## 证据表

| 问题 | 结论 | 证据（文件:行 / URL） | 可信度 |
|---|---|---|---|
| iframe 被 pointer-events 屏蔽 | 是，`dragstart` 时 `element.style.pointerEvents='none'`，仅 Shift 恢复 | 1.105.1 [webviewElement.ts](https://raw.githubusercontent.com/microsoft/vscode/1.105.1/src/vs/workbench/contrib/webview/browser/webviewElement.ts)（`_startBlockingIframeDragEvents` / `_stopBlockingIframeDragEvents` / `mountTo` 的 DROP 监听）；[webviewWindowDragMonitor.ts](https://raw.githubusercontent.com/microsoft/vscode/1.105.1/src/vs/workbench/contrib/webview/browser/webviewWindowDragMonitor.ts)（`DRAG`/`DRAG_OVER` 分支：`event.shiftKey ? onDragEnd() : onDragStart()`） | 高 |
| 本机 1.105.1 命中同一逻辑（已编译产物核对） | 是 | `...\Microsoft VS Code\resources\app\out\vs\workbench\workbench.desktop.main.js` 字节偏移 **3467834**：`...ae.DRAG,n=>{n.shiftKey?s():t()}),...ae.DRAG_OVER,n=>{n.shiftKey?s():t()})`；偏移 **11970511**：`windowDidDragStart(){this.kb()}windowDidDragEnd(){this.lb()}` | 高 |
| webview 文档内 VS Code 注入的 drag 监听 | 有：`dragover`/`drag` 与 `drop` **无条件 preventDefault**；`dragenter` 仅在"全为 file 项且非 Shift"时上报 `drag-start` | `resources\app\out\vs\workbench\contrib\webview\browser\pre\index.html` **L804-L844**、注册于 **L935-L938**（window）与 **L1241-L1244**（contentWindow）；sha256 `4A4388EC31C92A16B35FBF63BD27BA216831875C8E970C3501969CAC8F56FF4E`，与 1.105.1 上游 `src/vs/workbench/contrib/webview/browser/pre/index.html` 同尺寸 41142B | 高 |
| 版本起点 | PR #209211（2024-06-19 合入 main，June 2024 里程碑）引入 Shift 恢复；PR #225000（2024-08-07，July 2024 Recovery 1）**只在 1.92 恢复分支**回退 | [PR #209211](https://github.com/microsoft/vscode/pull/209211)、[PR #225000](https://github.com/microsoft/vscode/pull/225000)；raw 源码实测：**1.92.2 无** Shift 分支、**1.93.0 有**、1.105.1 有 | 高（1.92.0 是否已含未验证） |
| 无官方 webview drop API | 是 | 仓库 `node_modules/@types/vscode/index.d.ts`：仅 L6215-L6272 `DocumentDropEditProvider`（编辑器）、L11996 起 `TreeDragAndDropController`（树）；全文 `Drop` 检索无 webview 成员 | 高 |
| 侧边栏 view 亦挂 drag monitor | 是 | 1.105.1 [webviewViewPane.ts](https://raw.githubusercontent.com/microsoft/vscode/1.105.1/src/vs/workbench/contrib/webviewView/browser/webviewViewPane.ts) `activate()`：`new WebviewWindowDragMonitor(getWindow(this.element), () => this._webview.value)`；同处重派发 `DRAG/DRAG_END/DRAG_ENTER/DRAG_LEAVE/DRAG_START`（**不含 DRAG_OVER/DROP**）到 `dropTargetElement` | 高 |
| Explorer 拖拽写入的 keys | 见下节 | 1.105.1 [workbench/browser/dnd.ts](https://raw.githubusercontent.com/microsoft/vscode/1.105.1/src/vs/workbench/browser/dnd.ts) `fillEditorsDragData`；编译产物偏移 4132621/4134241 | 高 |
| 「资源管理器拖拽时 files 为空」 | 是 | 同上（`fillEditorsDragData` 只调 `setData`，从不 add File item）；[SO 79010180](https://stackoverflow.com/questions/79010180/capturing-uri-from-drag-and-drop-from-explorer-to-webview-in-a-vs-code-extension) 提问者实测 `dataTransfer.files` 为空（Finder 拖拽则正常） | 高（宿主侧）；webview 侧未实测 |
| 未按 Shift 时 webview 收不到事件 | 是（源码推导） | 同第 1 行；#182449 中 mjbvz 的设计说明（[comment](https://github.com/microsoft/vscode/issues/182449#issuecomment-1552214188)） | 高（推导）/ 实测缺失 |
| 官方文档差异说明（侧边栏 vs 编辑器） | **未找到**任何官方文档记载此差异 | 源码未见分支；[Webview 文档页](https://code.visualstudio.com/api/extension-guides/webview) 抓取前段无 DnD 章节（抓取被截断，非结论性） | 低（未验证） |

## DataTransfer 精确内容

**宿主侧（VS Code 资源管理器拖拽实际写入，源码级）**：

| key | 是否写入 | 值格式 |
|---|---|---|
| `Files`（`types` 里的标记）/ `dataTransfer.files` | **否**（仅字符串项） | — |
| `text/plain` | 是 | `labelService.getUriLabel(uri,{noPrefix:true})`，多选用 `\r\n`（Windows）连接，如 `src/a.ts` 或 `d:\code\x.ts`；**目录也含**。非 URI |
| `DownloadURL` | 仅"单个非目录文件" | `application/octet-stream:<basename>:file:///d%3A/code/x.ts` |
| `ResourceURLs` | 有 ≥1 个非目录文件时 | JSON 数组，元素为 `URI.toString()`，如 `["file:///d%3A/code/x.ts"]`（百分号编码）。**目录被排除** |
| `CodeEditors` | 是（每个 URI 生成一个 editor 条目） | VS Code `stringify()` 序列化对象数组，含 `resource` URI；非公开稳定契约 |
| `application/vnd.code.uri-list` | 是 | `UriList.create(...)`：`\r\n` 分隔的完整 URI 列表，**含目录**，可能带 `#L3,5` 片段。多选时只有这里有全量 |
| `text/uri-list` | 是 | **仅第一个** URI（源码注释：Chromium bug 239745 限制） |
| `CodeFiles` | 扩展树视图路径会写 | JSON 数组的 `fsPath`（`d:\code\x.ts`）。**内置资源管理器是否写未验证** |

大小写：规范要求 `setData/getData` 的 format 转 ASCII 小写，但 VS Code 源码用 `'ResourceURLs'`/`'CodeEditors'`/`'CodeFiles'` 原样常量，且自身比较器 `Lh()`（编译产物偏移 1858363）**两侧都 toLowerCase**。**结论：实际存储大小写未验证，webview 侧务必大小写不敏感匹配。**

**webview 侧可读性**：HTML 规范规定 drag 数据只在 `dragstart`（读写）与 `drop`（只读）可读，其余事件为 protected mode 返回空串（[spec 6.11.2/6.11.3](https://html.spec.whatwg.org/multipage/dnd.html)：`getData` 步骤只判 protected mode，**规范本身没有跨源条款**）。但 [whatwg/html#12807](https://github.com/whatwg/html/issues/12807) 明确说跨源/sandbox iframe 的原生 DnD「不可靠」（引用 Chromium 251718）。**因此 webview 内究竟能读到哪些 key，本次无法证实，必须在目标机器上实测。**

## 建议的 webview 侧代码

```js
const zone = document.getElementById('composer');

// (a) 允许 drop。必须 preventDefault —— VS Code 注入脚本也会 preventDefault，
//     但显式写出来才能控制 dropEffect。
zone.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

zone.addEventListener('drop', (e) => {
  e.preventDefault();
  const dt = e.dataTransfer;
  if (!dt) return;

  // (b) 先枚举 types，再逐个尝试（大小写不敏感）。getData 只在 drop 中可读。
  const raw = {};
  for (const t of Array.from(dt.types || [])) {
    try { raw[t] = dt.getData(t); } catch { /* ignore */ }
  }
  const pick = (name) => {
    const k = Object.keys(raw).find((x) => x.toLowerCase() === name);
    return k ? raw[k] : '';
  };

  const paths = new Set();
  const addUri = (u) => {
    try {
      const url = new URL(u.trim());
      if (url.protocol !== 'file:') return;
      let p = decodeURIComponent(url.pathname);          // /d:/code/x.ts
      if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);        // d:/code/x.ts
      paths.add(p.replace(/\//g, '\\'));                 // Windows 形式
    } catch { /* 非 URI 忽略 */ }
  };

  // 优先级：完整内部列表 > text/uri-list > ResourceURLs(JSON,仅文件) > CodeEditors
  const internal = pick('application/vnd.code.uri-list');
  if (internal) internal.split(/\r?\n/).forEach((l) => l && !l.startsWith('#') && addUri(l));
  if (!paths.size) pick('text/uri-list').split(/\r?\n/).forEach((l) => l && addUri(l));
  if (!paths.size) {
    try { JSON.parse(pick('resourceurls') || '[]').forEach(addUri); } catch {}
  }
  if (!paths.size) {
    try {
      JSON.parse(pick('codeeditors') || '[]').forEach((ed) => {
        const r = ed?.resource;
        if (typeof r === 'string') addUri(r);
        else if (r?.scheme === 'file' && r.path) addUri(`file://${r.path}`);
      });
    } catch {}
  }
  // 目录：application/vnd.code.uri-list / text/plain 都可能含目录（路径以 \ 结尾或不带扩展名）
  // 多选：只有 application/vnd.code.uri-list / ResourceURLs / text/plain 是多值，
  // text/uri-list 只有 1 条（VS Code 源码注释已说明原因）。

  vscode.postMessage({ type: 'droppedPaths', paths: [...paths], raw }); // (c)
});
```

**配套要求与取舍（建议先做）**：

- UI 必须提示「按住 Shift 拖入」，否则用户会以为功能坏了；不按 Shift 时文件会被 VS Code 在编辑器区打开。
- 上线前先加一次性探针：把 `Array.from(dt.types)` 与每个 `getData` 原样 `postMessage` 回扩展宿主打印，用真实机器确认可读性（本笔记无法替代实测）。
- **可靠替代入口（推荐至少做一个）**：① 侧边栏加一个 `TreeView`，用 `TreeDragAndDropController.handleDrop` —— 官方支持、能在扩展宿主拿到 `DataTransfer`，且文档明确「用 `text/uri-list` 取资源管理器/树拖来的资源」（`@types/vscode/index.d.ts:6266`）；② 编辑器侧 `DocumentDropEditProvider`（需 `editor.dropIntoEditor.enabled`，`dropMimeTypes: ['text/uri-list']`），拿到的 `DataTransferFile` **只在从编辑器外部拖入时**才有（同文件 L6269-L6272）；③ webview 内加"选择文件"按钮兜底。

## 未验证 / 存疑点

1. **webview 内 `getData` 的真实返回值未实测**：跨源 iframe 是否被 Chromium 过滤（只放行 `text/plain`/`text/uri-list`）无法从规范确认，仅有 whatwg/html#12807 的二手论述。→ 必须实测。
2. **Shift 是否真的有效存疑**：microsoft/vscode#237958（VS Code 1.96.3，2025-01-15，**open**，`bug`+`webview`，assigned mjbvz，Backlog）称"拖资源管理器文件 → 文件被编辑器打开、事件捕不到；按 Shift 也捕不到"。与源码设计意图冲突，本机 1.105.1 未做 GUI 实测。
3. **1.92.0 是否含 Shift 逻辑未验证**（只核对 1.92.2 无 / 1.93.0 有）。
4. **`CodeFiles` 是否由内置资源管理器写入未验证**；扩展树视图路径会写 `fsPath` JSON。
5. **key 的实际大小写未验证**（规范要求小写化，VS Code 自身比较大小写不敏感）。
6. **Cursor 1.128.0（fork）未核对**：本机 `D:\Users\liaohai1\AppData\Local\Programs\cursor\` 未检索。若需在 Cursor 上支持，需按同样方法核对 `resources\app\out\vs\workbench\workbench.desktop.main.js` 是否含 `n.shiftKey` 分支。
7. **未找到成功的先例代码**：本次检索只找到失败报告（#237958、SO 79010180、cline#5039、kilocode#8451、anthropics/claude-code#25128），未找到任何已发布扩展在 webview 内可靠读取 Explorer 拖拽路径的实现。`OpenAgentd` 的 drop 修复（[commit ad92c0d](https://github.com/lthoangg/OpenAgentd/commit/ad92c0d77c28009a1217537bec0cef7891af2d51)）针对**操作系统文件拖拽**（`files`/`items`/`webkitGetAsEntry` 过滤目录），不适用于 Explorer 内部拖拽。

## 2026-09-17 真机补充（用户实测 + 页面侧探针）

> 本节写在原快照之后，**不改上面的原文**：上面是 09-17 当日的源码取证，这里是同日的实测结果。

1. **真机拖拽：不生效**（用户实测 v0.5.1，VS Code/Cursor）。**未确认用户当时是否按住过 Shift** —— 按上面的源码结论，不按 Shift 一定不进 webview（这正是 `09-17` 那次分析预判的结果），所以这一条**还不能判定 Shift 方案失败**，需要用户补一次带 Shift 的复测。
2. **页面侧链路已被证明是好的**：`npm run probe:composer`（真实 `dsh web` + headless Chromium + 注入真 `bridge-client.js`）里，用 VS Code 形状的 `dragover`/`drop`（`application/vnd.code.uri-list` + `text/plain`）实测：
   - `dragover` 被接管（`defaultPrevented=true`）、`drop` 被接管；
   - 原始负载被正确转发：`{"type":"dsh-context-drop","payload":{"application/vnd.code.uri-list":"file:///d%3A/code/proj/src/a.ts","text/plain":"src/a.ts"}}`。
   → 因此真机拖不动的原因**不在我们的页面代码**，而在 VS Code 是否把事件交给 iframe（cross-origin iframe + `pointer-events:none` 屏蔽，即上面的第 1 条）。
3. **仍未验证**：真实跨源拖拽时 `getData` 能否读到 VS Code 私有 mime（探针里的 `DataTransfer` 是页面自己造的，读得到是理所当然）。这一条只能靠真机 + Shift 复测，或改走宿主侧 `TreeDragAndDropController`（`07-待办` 的 E3）。

4. **Cursor 1.128.0 已核对：与 VS Code 同一套逻辑**（关闭本文件 §未验证点 6 / `05-验证` V-03）。Cursor 的 `resources\app\out\vs\workbench\workbench.desktop.main.js` L16676 里是同一个 `WebviewWindowDragMonitor`：
   `DRAG_START→n()`、`DRAG_END→i()`、`MOUSE_MOVE(buttons===0)→i()`、`DRAG→r.shiftKey?i():n()`、`DRAG_OVER→r.shiftKey?i():n()`。→ **Cursor 上同样只有 Shift 这一条放行路径**。

5. **为什么我们绕不过去**（本机 1.105.1 代码级证据，两条都实测过）：
   - 屏蔽动作是 **workbench 设在自己文档里的 iframe 元素上**：`kb(){this.n&&(this.n.style.pointerEvents="none")}`，恢复是 `lb(){…="auto"}`（bundle L4069，与 `windowDidDragStart()/windowDidDragEnd()` 同一类）。我们的页面是被跨源沙箱包住的 iframe，**碰不到父文档的 DOM**，所以改不掉这个样式。
   - 唯一能让它恢复的输入，是 **workbench 窗口上带 `shiftKey` 的 `drag`/`dragover` 事件**（同 L537 的 `V9e` 类）。webview 内部脚本确实会回传这个信号（`pre/index.html` L821-840 的 `handleInnerDragEvent` → `postMessage('drag',{shiftKey})`，workbench 侧 L4069 的 `wb(e,t)` 用 `new DragEvent` 重派发），**但它只在 iframe 已经收得到拖拽事件时才触发**——而"收得到"正是被屏蔽的东西。这是死循环：不按 Shift 就没有事件，没有事件就无法上报 Shift。
   - **没有开关**：`src/vs/workbench/contrib/webview/browser/webview.contribution.ts`（1.105.1）里没有任何 `configurationRegistry` 注册；本机 bundle 也检索不到 `workbench.webview*` 形式的设置项。→ 不能靠改设置绕过。

6. **理论上唯一的"不按 Shift"黑招，以及为什么不建议做**：既然 workbench 接受"带 shiftKey 的 drag 事件"作为放行信号，而 webview 内部脚本的上报条件只要求"`dataTransfer.items` 全部是 `file` 项"，那么注入脚本**自己造一个带 File 项的 `dragover`（`shiftKey:true`）**，就能借道把 workbench 的 webview 全部解除屏蔽。代价：
   - 我们**无法知道用户何时开始拖拽**（拖拽期间我们收不到任何事件），所以要有效就得**周期性反复伪造**；
   - 那会让所有 webview 在**任何**拖拽期间都保持可投放，直接抵消 VS Code 屏蔽 iframe 的初衷——**用户在 VS Code 里拖文件去分屏/拖到终端等正常操作，一旦指针经过我们的面板就会被我们截走**；
   - 依赖的是未公开内部实现（`pre/index.html` 的上报条件 + `wb()` 重派发），上游一改就静默失效。
   → **判定：不做**（登记在此，避免下一轮重新论证）。等价体验走"官方支持的三条路"：右键入口（已交付）、快捷键（可选）、TreeView 投放区（E3）。
