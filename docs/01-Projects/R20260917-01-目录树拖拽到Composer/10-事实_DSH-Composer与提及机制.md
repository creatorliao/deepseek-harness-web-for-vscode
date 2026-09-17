# 事实：DSH Web Composer 与 @ 提及机制

**日期**: 2026-09-17 ｜ **状态**: 当前 ｜ **性质**: 读本机产物（静态取证，**未起服务、未发请求**）
**定位**: 回答"程序化把 `@文件引用` 写进 DSH 输入框有哪些可行通路"，是特性 R20260917-01 的方案依据。
**核实版本**: DSH **0.1.5-rc.2**

> 调查方法：读取本机磁盘上的产物与未压缩插件 bundle。
> 凡标「未验证」的条目均未取得直接证据，请勿当结论使用。
>
> **路径缩写**（全文通用，替换后可得到绝对路径）：
> - `PKG` = `D:\Users\liaohai1\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai`
> - `DIST` = `PKG\dsh-web-frontend\dist`
> - `CACHE` = `D:\Users\liaohai1\AppData\Roaming\Code\User\globalStorage\creatorliao.deepseek-harness-for-vscode\dsh-dist`
> - `CONV` = `PKG\dsh-client-ui-conversation\lib\client.js`（composer 所在，16,864 行）
> - `TRIG` = `PKG\dsh-client-ui-input-trigger\lib\client.js`（@ / 斜杠菜单所在，1,154 行）
>
> 「`:NNNN`」形式指上文最近一个 `CONV`/`TRIG` 文件的行号。

## 结论（TL;DR）

1. 版本 **0.1.5-rc.2**。composer **不在** `DIST` 的 shell bundle 里，而在**运行时按需加载的插件 bundle** `PKG\dsh-client-ui-conversation\lib\client.js`（644,944 B / 16,864 行，**未压缩、保留注释**）。
2. composer 是 **Lexical** 富编辑器，挂在一个 `contenteditable` 的 `<div>` 上：`[data-composer-input]`，带 `role="textbox"` `aria-multiline="true"`。**不是** textarea。
3. 占位符**不是** `placeholder` 属性，而是一个独立 `div[data-composer-placeholder]`（另有 `data-placeholder` / `aria-label` 冗余承载同一文案）。中文默认值 `发消息或创建任务, / 调用指令, @ 文件或对话`。
4. **关键结论：落纯文本 = 走 picker。** 文件 `@` 提及的 chip，其 `serialize()` 就是恒等函数（`ref` 本身即 `@path`），clipboard 投影也是同一个字符串。所以「手打/粘贴 `@src/foo.ts `」与「选一次补全」在**发给模型的消息里逐字节相同**。
5. 因此**没有任何客户端或服务端的正则扫描**把 `@path` 解析成文件引用。`@path` 的语义由**模型**依据一段条件注入的系统提示词自行理解（`read` 工具可用时才注入）。与之相对，`@[label](dsh-session:…)` 会话引用**是**在 `agent/pre-step` 服务端解析的。
6. 路径格式为**工作区相对、正斜杠**（`docs/03-Resources/x.md`），**不是**绝对路径、**不是** `file://`。
7. 拖放只接受 `dataTransfer.types.includes("Files")`——即从资源管理器拖真实文件。**`text/uri-list` / 纯路径文本拖放不被原生处理**（直接 return，连 `preventDefault` 都不调）。

## 版本与产物位置

- `dsh --version` → `0.1.5-rc.2`（实测；stderr 前有一行 crashpad `CreateFile: 拒绝访问 (0x5)`，与版本无关）。
- `PKG\dsh\package.json`：`"version": "0.1.5-rc.2"`，`"bin": {"dsh": "lib/bin.js"}`。
- shell 产物（`index.html` **只存在于 npm 包**）：
  | 文件 | 大小 |
  |---|---|
  | `DIST\index.html` | 679 B |
  | `DIST\assets\index-BKQ_L1z6.js`（主 bundle） | 555,959 B |
  | `DIST\assets\vendor-CCJJTK99.js` | 740,575 B |
  | `DIST\assets\index-DPX2bQLO.css` | 51,949 B |
  | `DIST\assets\vendor-BNsW4eBh.css` | 29,288 B |
- `DIST\index.html` 引用的即上述四个 assets（相对路径 `./assets/...`）。
- **manifest rev**：`CACHE\rev.txt` = `918a4d2126ca`（12 字符）。
- `CACHE` 下**没有 `index.html` / `favicon.svg`**，只有 `assets\` + `rev.txt`——即该缓存不是完整 dist 树。`CACHE\assets\vendor-BNsW4eBh.css` 为 38,787 B，比 npm 原件大；**首个差异在第 94 字节**：缓存副本把字体 URL 改写成了 `https://file+.vscode-resource.vscode-cdn.net/d%3A/.../assets/fonts/...`（扩展的 webview 重写），非版本差异。
- 插件 bundle 形态：每个 `PKG\dsh-client-*\lib\client.js` 都是一个 `window.__ModuleLoader__.load({ id, factory })` 经典脚本，由 `__DSH_BOOT__.entries[].url`（`/plugins/<id>/client.js?rev=…`）加载。**composer、@ 提及、拖放全在这些插件里，不在 shell bundle 里。**
- **插件 CSS 是运行时注入的**，不在上面两个 CSS 资产里。dist 的两个 CSS 文件里 **`composer` / `uV2eYG` / `_3e4SsG` / `_composer_` / `_chip_` 出现次数均为 0**；composer 样式以 `<style data-plugin-css="…">` 形式由插件自注入（`PKG\dsh-client-ui-conversation\lib\client.js:15758`–`15765`）：
  ```js
  const tagId$1 = "@deepseek-ai/dsh-client-ui-conversation/InputBar.module.css";
  if (… document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-conversation";
    tag.dataset.pluginCss = tagId$1; tag.textContent = css$1; document.head.appendChild(tag); }
  ```
- 有 47 个 `dsh-client-*` 包在盘上，但 **`dsh-client-ui-primitives` 不在盘上**——它由 shell bundle 作为 **static module** 内联提供（`DIST\assets\index-BKQ_L1z6.js` 中 `staticModules` 种子：`react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` / `@deepseek-ai/cordis` / `@deepseek-ai/dsh-client-store` / `@deepseek-ai/dsh-client-ui-slots` / `@deepseek-ai/dsh-client-ui-primitives` / `@deepseek-ai/dsh-client-ui-dockkit`）。所以 `Tooltip`、`ReferenceIcon`、`relativeTime` 等实现**在本机磁盘上无源码可读**。

## composer 结构与选择器

可编辑面的渲染函数（`PKG\dsh-client-ui-conversation\lib\client.js:15146`）：

```js
function ComposerContentEditable({ editor, editable, ...rest }) {
  const ref = react.useRef(null);
  react.useLayoutEffect(() => { const el = ref.current; if (editor === null || el === null) return;
    editor.setRootElement(el); return () => { editor.setRootElement(null); }; }, [editor]);
  ...
  return jsx("div", { ref, contentEditable: editor !== null && editable,
    suppressContentEditableWarning: true, role: "textbox", "aria-multiline": "true",
    "data-composer-input": true, ...rest });
}
```

调用点（同文件 `:16105`–`:16118`）补上类名与状态属性：

```js
jsx(ComposerContentEditable, {
  editor: workspaceTrigger ? null : editor, editable,
  className: clsx(InputBar_module_css_default.input, editorDisabled && InputBar_module_css_default.inputDisabled),
  "data-phase": input?.phase ?? "inert",
  "aria-disabled": editorDisabled || void 0,
  "data-placeholder": placeholderText,
  "aria-label": workspaceTrigger ? t("hero.chooseWorkspace") : placeholderText, ... })
```

- `editor` 类型为 `LexicalEditor`（`...\lib\types\client\input\editor\ComposerContentEditable.d.ts:2,6`）。`setRootElement` 会给该元素加 `data-lexical-editor="true"`（`:8547`）——所以 `[data-composer-input]` **就是** Lexical root。
- 卡片 / 滚动容器 / 座位：`"data-composer-card": true`（`:16068`）、`"data-input-scroll": true`（`:16101`）、`"data-composer-seat": ""`（`:14944`，ui-chat 用它做滚动计算，见 `PKG\dsh-client-ui-chat\lib\client.js:1974,2402`）。
- **placeholder 是独立 div，不是属性**（`:16119`）：

```js
draft === "" && attachments.length === 0 && !claimActive && jsx("div", {
  "aria-hidden": true, className: InputBar_module_css_default.placeholder,
  "data-composer-placeholder": true, children: placeholderText })
```

其 CSS 是绝对定位覆盖层（非 `::before`，非 Lexical Placeholder 插件）：`.uV2eYG_placeholder{…position:absolute;inset:4px 8px auto 14px…}`（`:15757` 单行 CSS 串）。
文案取值（`:16050`）：`placeholder ?? (parentOffline ? t("placeholder.parentOffline") : disabled ? t("placeholder.unavailable") : canSteerQueue ? t("placeholder.steerQueue") : planActive ? t("placeholder.plan") : t("placeholder.default"))`。
zh 字典（`:13639`）：`"placeholder.default": "发消息或创建任务, / 调用指令, @ 文件或对话"`；hero `:13642` = `"描述你想要构建的内容, / 调用指令, @ 文件或对话"`；en `:13801` = `"Message or run a task, / commands, @ files or sessions"`。
- 按钮：命令菜单按钮 `aria-label: t("input.commands")`（`:16141`，zh=`指令`）；附件按钮 `aria-label: t("file.attach")`（`:16157`）；主按钮（发送/停止）`className: …primary` + `aria-label: primaryLabel`（`:16222`–`:16225`）。**`primaryLabel` 是状态相关的**（`:16020`–`:16025`）：`primaryStops ? t("input.stop") : running && steeringAvailable && … && plainMessageDraft ? t(primarySubmitMode === "steer" ? "input.send.steer" : "input.send.queue") : t("input.send")` → zh 取值集 `{发送消息, 排队发送, 插话发送, 停止生成}`。**无** `data-testid`、**无** `id`。
- 键盘不挂在 composer 的 React `onKeyDown` 上（唯一的 `onKeyDown` 属于 inert 的 workspace-picker 态，`:16116`），而是走 **Lexical command 层** `registerComposerKeymap`（`:15209`，注册 up/down/tab/escape/space/enter/paste，`:15228`–`:15273`）。
- **类名是 CSS-module 哈希，两套方案**：
  - 插件 bundle 内（Scheme A）`<6 字符前缀>_<角色名>`，映射表对象字面量在 `:15766`–`15789`：`"input": "uV2eYG_input"` `:15773`、`"primary": "uV2eYG_primary"` `:15781`、`"placeholder": "uV2eYG_placeholder"` `:15780`、`"card"`、`"scroll"`；另有 `"composerSeat": "wSkVaW_composerSeat"` `:14664`、`"chip": "yAWgPa_chip"` `:11836`、`composer_editor_module_css_default = { "textRef": "q44v1G_textRef" }` `:12230`、`"item": "_3e4SsG_item"`（`PKG\dsh-client-ui-input-trigger\lib\client.js:880`）、`"imageItem": "_54WpYG_imageItem"`（`PKG\dsh-client-ui-attachment\lib\client.js:598`）。
  - 预构建 shell CSS 内（Scheme B）`_<名字>_<hash>_<行号>`，例如 `._input_1g6ru_25`、`._boot_1fywu_3`（`DIST\assets\index-DPX2bQLO.css` 单行；映射见 `DIST\assets\index-BKQ_L1z6.js`）。**Scheme B 里没有 composer 选择器。**
  - **前缀随源码内容变化，哈希会随构建漂移，不可依赖。**

### 稳定 DOM 锚点（问题 4）与稳定性评估

| 用途 | 选择器 | 定义处 | 稳定性 |
|---|---|---|---|
| (a) 可编辑元素 | `[data-composer-input]` | `CONV:15165` | **最稳**：语义 `data-*`，全 DOM 唯一，无类名 |
| (a) 同上（Lexical 自加） | `[data-lexical-editor="true"]` | `CONV:8547` | 稳（属上游 Lexical，换编辑器则失效） |
| (a) 语义冗余 | `[role="textbox"][aria-multiline="true"][contenteditable="true"]` | `CONV:15161`–`15164` | 较稳 |
| 卡片 / 滚动 / 座位 | `[data-composer-card]` `[data-input-scroll]` `[data-composer-seat]` | `CONV:16068` / `:16101` / `:14944` | 稳；前两者已被 `TRIG:931` 等跨插件读取，实为公开契约 |
| 占位符文本 | `[data-composer-placeholder]`（读 `textContent`）或编辑器根上的 `data-placeholder` | `CONV:16122` / `:16111` | 稳 |
| chip / 纯文本引用 | `[data-composer-chip="reference"]` / `[data-composer-text-ref]` | `CONV:11954` / `:12271` | 稳（注释自述为 "test/e2e anchor"） |
| (c) 弹出菜单根 | `[data-trigger-menu]` | `TRIG:944` | 稳（菜单唯一稳定锚点） |
| (c) 列表 | `role="listbox"`（`aria-activedescendant` 挂在这里，**不在 textbox 上**） | `TRIG:968`–`970` | 稳 |
| (d) 候选项 | `button[role="option"]`，`id="dsh-slash-option-<source>-<index>"` | `TRIG:1000`–`1003`、`optionId()` `:908` | 稳（`source` 名 `reference` 属契约层）。**无 `data-index`** |
| (d) 选中动作 | 选项只在 **`mousedown`** 上 pick | `TRIG:1005`–`1008` | 稳（必须派发 `mousedown`，`click` 无效） |
| ❌ 不可用 | 一切 CSS-module 哈希类名（`uV2eYG_input`、`wSkVaW_composerSeat`、`_3e4SsG_item`、`_54WpYG_rail`…） | — | 随构建漂移 |
| ❌ 不存在 | composer 上**没有** `data-testid`、**没有** `data-dsh-*`、**没有** `id` | — | — |

**两个必须注意的陷阱**：
1. `[data-composer-input]` 在**无会话/hero 态也存在**，但此时 `contentEditable` 为 `false`、`role`/`aria-label`/`tabIndex`/`onKeyDown` 切换成 workspace-picker 语义（`:16106`、`:16112`–`16116`）。注入脚本必须先判 `contenteditable` 或 `data-phase !== "inert"`。
2. `[data-phase]` **同时挂在 ConversationRoot 上**（`:14950`），单独用 `[data-phase]` 会歧义，必须与 `[data-composer-input]` 组合限定。

## @ 提及机制的完整链路

1. **触发**：`@` 的识别走共享语法 `activeAtToken`（`PKG\dsh-file-reference\lib\types\grammar.js:13`），正则 `(?:^|\s)(@"([^"]*))$` / `(?:^|\s)(@([^\s]*))$`——**行首或空白后**才触发，邮箱里的 `@` 不触发。`detectTrigger`（`PKG\dsh-client-ui-input-trigger\lib\types\core\detect.d.ts:18`）在光标处取出 `query` 与 `span`。
2. **source 注册**：`PKG\dsh-client-ui-reference\lib\client.js:104`，`trigger: "@"`、`name: "reference"`、`showGroupTitle: false`。
3. **候选查询（RPC）**：同文件 `:109`
   ```js
   const fileLookup = ctx.remote.fileReferences.list(session.sessionId, query, signal).then((result) => result.ok ? result.value : []);
   ```
   会话候选并行取自 `ctx.remote.sessionReferenceResolver.candidates(...)`；`:117` 用确定性顺序把**文件排在会话之前**。
   RPC 描述符（`PKG\dsh-api-session-controller\lib\typert.host.js:696`）：id `@deepseek-ai/dsh-api-session-controller#fileReferences/list`，service `sessionFileReferences`，namespace `fileReferences`，method `list`，参数 `agent`(wire `agentId`) + `query`(wire `query`)，`scope: { context: 'agent', wire: 'agentId' }`，`cancellation: { parameter: 'signal' }`；源码位置 `packages/api/session-controller/src/file-references.ts:33`。结果元素为 `FileReferenceCandidate`（`PKG\dsh-file-reference\lib\types\types.d.ts:7`）。
   **传输层**：`/api` 通道上的 **HTTP POST**。端点即 URL 路径（`PKG\dsh-client-connection\lib\index.js:673`）：
   ```js
   function endpointFromPath(channel, pathname) {
     if (!pathname.startsWith(`${channel}/`)) return void 0;
     const endpoint = pathname.slice(channel.length + 1); ... }
   ```
   处理器（同文件 `:635`–`:663`）要求 `request.method === "POST"`、`content-type: application/json`，请求体为 `{ rpcId, method, payload }` 信封，且 `message.method` 必须等于端点名；响应为 `{ type: "server-response", rpcId, result }`，`result` 形如 `{ ok: true, value }` 或 `{ ok: false, error }`（`:685`）。通道常量 `API_PATH = "/api"`（`PKG\dsh-client-connection\lib\index.js:13`）。
   → 因此真实调用是 **`POST /api/fileReferences/list`**，body 的 `payload` 为 `{ agentId: <sessionId>, query: <string> }`（字段名由描述符的 `wire` 决定，`:696`–`:727`）。
   > `dsh-client-connection\lib\client.js:5950` 也出现同名分支，但那是测试 fixture（同文件 `:5942` 自述 "fixture connection"），**不是**生产路径。
4. **过滤与排序**：`PKG\dsh-file-reference-local\lib\types\search.js:272`–`:302`。打分：`name === q` → 1000；`name.startsWith` → 900；`name.includes` → 700；`path.includes` → 500；子序列 → `300 + max(0, 100-gap)`；目录 `+25`。排序键：score ↓ → 目录优先（`:315`）→ 路径更短 → 字典序（`:279`）。含 `/` 的查询走实时目录列举（`:86`、`:196`），裸查询走有界模糊索引（`:91`），`maxResults` 默认 20。
5. **选中后插入什么**：`onPick`（`PKG\dsh-client-ui-reference\lib\client.js:122`）
   ```js
   if (value?.kind === "file") {
     if (value.fileKind === "directory" && action === "drill") return { text: value.mention, continue: true };
     return { insert: { source: "reference", ref: value.mention,
       label: value.fileKind === "directory" ? `${value.label}/` : value.label,
       appearance: value.fileKind === "directory" ? "folder" : "file",
       clipboardText: value.mention } };
   }
   ```
   `value.mention` 由 `formatFileMention` 生成（`grammar.js:32`）：无空白 → `` `@${path}` ``；有空白 → `` `@"${path}"` ``；目录 → `` `@"${path}` ``（引号保持开放以便续钻）。
   插入结果是一个 **Lexical 装饰器节点 chip**，DOM 为（`conversation\lib\client.js:11952`）：
   ```js
   const el = document.createElement("span");
   el.setAttribute("data-composer-chip", this.__source);   // data-composer-chip="reference"
   el.setAttribute("contenteditable", "false");
   ```
   即 **`<span data-composer-chip="reference" contenteditable="false">`**，不是内部文档节点，也没有暴露 ref 的 data 属性。`ref` 只存在 Lexical 节点状态里。

## 落文本 vs 结构化节点（关键结论）

**发送路径**（`conversation\lib\client.js:13151` `sinkSerialized`）：

```js
if (occurrences.length === 0) {                       // :13165 —— 没有 chip
  this.settleSink(attempt, this.deps.defaultSink(draft.trim(), attachmentIds, mode, attempt.signal));
  return;
}
... text: await inputTriggers.serializeReference(o.source, o.ref, attempt.signal)   // :13175
```

**`reference` source 的 codec 是恒等函数**（`PKG\dsh-client-ui-reference\lib\client.js:145`）：

```js
codec: { clipboardText: (ref) => ref, serialize: (ref) => Promise.resolve(ref) }
```

由此可推：
- chip 的 `ref` == `clipboardText` == `@path` == `serialize()` 的返回值。
- 于是「chip 路径」与「纯文本路径」产出的消息文本**完全相同**；`DefaultSink` 收到的都是同一个 `@path` 字符串。
- 纯文本 `@src/foo.ts ` 手打或粘贴时 `occurrences.length === 0`，走 `:13166`，**原样发送，没有任何解析**。

**是否有 `@` 正则扫描？没有。** 唯一一处「扫描文本里的 `@name`」是**纯装饰**：`TextRefNode`（`conversation\lib\client.js:12268`）只给匹配 token 加个哈希 class 和 `data-composer-text-ref` 属性；其设计说明明说 *"Color only, no icon: a token still carrying its trigger character is editable text, not a settled chip"*（`...\lib\types\client\input\editor\text-ref.d.ts:1`–`11`）。

**语义由谁解析？模型。** 提供方在 `read` 工具可用时注入一段稳定系统提示词（`PKG\dsh-file-reference\lib\types\index.js:9`）：

```
Tokens prefixed with @ are workspace paths the user explicitly referenced, relative to the workspace root. A trailing slash marks a directory: list it when its contents matter. Anything else is a file: use the read tool when its contents are needed, and do not claim to have inspected it before reading. @"..." quotes a path containing spaces.
```

注入条件见 `PKG\dsh-file-reference-local\lib\index.js:345`（`agent.ctx.tools.get("read", agent) === void 0 ? "" : FILE_REFERENCE_PROMPT`）。两处 README 也明确「选中候选绝不读取或附带文件内容」「所选文件仍是普通提示词文本」（`PKG\dsh-file-reference\README.zh.md:12,102`）「所选路径只会贡献普通用户消息中的对应字符」（`PKG\dsh-file-reference-local\README.zh.md:113`）。

**载荷形状**（`conversation\lib\client.js:2950`–`:2958`）：

```js
content = [...await serializeAttachments(), ...text === "" ? [] : [{ type: "text", text }]];
... await session.prompt(content, mode, signal, submission.requestId)
```

即一个 **content block 数组**：图片 `{type:'image', mediaType, data, name?}`、文件 `{type:'file', receiptId}`（`:2920`–`:2926`）、文本 `{type:'text', text}`。**mentions 不是独立数组**，没有 `mentions` / `references` / `contextFiles` 字段；唯一的文本块就承载全部 `@path`。

**对照：会话引用是服务端解析的。** `@[label](dsh-session:<base64url>)` 在 `agent/pre-step` 被 `dsh-session-reference` 解析并追加一条 `## Referenced sessions` 快照（`PKG\dsh-session-reference\README.zh.md:32,90`）。**文件引用没有这条通路。**

**全局钩子**：shell 暴露的是 `globalThis.__DSH_BOOT__`、`globalThis.__DSH_TRANSPORT__`、`globalThis.__ModuleLoader__`、`globalThis.__DSH_BOOT_READY__`（`DIST\assets\index-BKQ_L1z6.js`，单行压缩，偏移 ~553816–554033）。模块加载器只对外暴露 `load(registration)`（`PKG\dsh-client-modules\lib\client.js:220`–`:233`），**没有公开的 `require(id)`**，cordis `ctx` 未发布。内部插入动词是 cordis 作用域事件——`actx.bail(actx, "slash/input-insert-reference", {reference, span})`（`PKG\dsh-client-ui-input-trigger\lib\client.js:624`；`-insert-text` `:619`；`-begin-command` `:615`），监听方在 `conversation\lib\client.js:13448`–`13451`。**没有 `window.__DSH` / 自定义事件 / postMessage 通道可用**（除 boot 清单）。

## 可行的程序化插入方案（按可靠性排序）

1. **只把 `@path` 当普通文本写进 draft**（语义上等价，最省事）。
   公开动作面 `InputActions.setDraft(text)`（`...\contract\input.d.ts:211`）/ `SessionInput.setDraft`（`:174`）/ `paste(text)`（`:251`）。**但拿到这个 facade 需要 `ctx`**——即需要一个 DSH 插件。若走 DOM，必须经过 Lexical 的输入管线（`document.execCommand("insertText")` 触发 `beforeinput`），**直接改 DOM 文本会被下一次 Lexical commit 覆盖**。
2. **发布一个 DSH 客户端插件**，`inject: ["inputTriggers","sessions"]`，然后 `actx.bail(actx, "slash/input-insert-text", { text: "@src/foo.ts ", span })`（或 `-insert-reference` 造真 chip）。这是 ui-reference 自己走的路，官方支持、最稳，但需要按官方插件机制打包发布。仓库内已有同向结论：[../R20260914-02-DSH内嵌原理与教程/04-方案_DSH界面调整与侧边栏收纳.md](../R20260914-02-DSH内嵌原理与教程/04-方案_DSH界面调整与侧边栏收纳.md)。
3. **绕过 composer，直接调 host RPC**（对本项目最现实）：RPC 就是 `POST /api/<endpoint>`（见上），扩展本就在代发 `127.0.0.1` 的 `/api` 请求，把 `[{type:'text', text:"@src/foo.ts …"}]` 作为用户消息投递即可，效果与在输入框里打字发送一致（因为 payload 相同）。**待补**：prompt 端点名 + 是否受 DSH `/api` 信任围栏额外约束（会话/agent 作用域头）。
4. **模拟"打字 + 选菜单"**（不推荐，且收益为零）：focus `[data-composer-input]` → 输入 `@` + 查询 → 等 `[data-trigger-menu]` 出现 → 对 `#dsh-slash-option-reference-0` 派发 **`mousedown`**（选项只在 mousedown 上 pick，`:1005`）。既然 chip 与纯文本 payload 相同，**picker 不带来任何额外语义**，只带来时序脆弱性。

## 未验证 / 存疑点

- `/api` RPC 的**传输层已确认**（HTTP POST，见上文），但 **`fileReferences/list` 在真实会话上的端到端实测（含 `/api` 信任围栏要求）未做**——未起服务、未发请求。
- 直接调 host `session.prompt` 的 **RPC endpoint 名与参数形状未验证**（机制已知：同样走 `POST /api/<endpoint>`；缺的是端点名与 payload schema）。
- 粘贴 `@src/foo.ts`（尤其结尾带 `@`）**是否会自动弹开菜单**未验证。代码只说明「settled caret 处的 update listener 会重新 track，开放 token（目录 pick 的尾斜杠）会自动重开菜单」（`...\input\facade.d.ts:232` 的 JSDoc），未覆盖粘贴场景。
- `document.execCommand("insertText")` 是否能可靠走通 Lexical 的 `beforeinput` 并更新 `InputState.draft`，**未实测**。
- 模型对**手打** `@path`（未经过 picker）的遵循程度是模型行为问题，**未实测**；代码层只能证明 payload 相同、提示词已注入。
- `PKG\dsh-client-ui-conversation\lib\client.js` 中 chip 的 `ref` 值**未在运行时 dump 验证**，仅由 `onPick` 构造 + codec 恒等推出。
- 拖放方向已做**穷尽式静态扫描**（全 `@deepseek-ai` 树的 `lib\client.js` 中 `addEventListener("drop"|"dragover"|"dragenter"|"dragleave")` 与 React `onDrop:` 属性）。命中的文件 drop 目标**只有** `dsh-client-ui-attachment`（`:616`–`:664`，即上文所述，仅收 `Files`）；`dsh-client-ui-sidebar-documentpreview:5558` 属文档预览、`dsh-client-ui-workspace:1333` 与 `:987`/`:1684` 属**会话行拖拽排序**，均与文件引用无关。**但未做运行时 DOM 观测**，不排除运行时注入的动态监听器。
- 全局搜索未发现 `text/uri-list` 的文件 drop 处理（唯一命中 `CONV:11299` 位于 vendored Lexical 的**编辑器内文本**拖放路径，读 `text/plain` 优先、`text/uri-list` 兜底，属"把文本拖进编辑器"，不是文件引用）。
- 用户问题的原始假设「@ 提及会被落成 `<span>` chip 或内部文档节点」**只在经过 picker 时成立**；chip 的 `ref` 与 `clipboardText` 都是 `@path` 本身，故二者在消息载荷上不可区分。
