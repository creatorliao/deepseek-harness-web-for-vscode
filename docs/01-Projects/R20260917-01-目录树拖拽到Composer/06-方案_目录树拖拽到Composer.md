# 方案：目录树拖拽到 Composer

**日期**: 2026-09-17 ｜ **状态**: 待评审（按用户一次性授权先执行）
**定位**: 回答"怎么做"。事实底座见 `03-分析`，原始证据见 `04-事实` / `05-事实`。
**承接需求**: `02-需求_目录树拖拽到Composer.md` 的 R1–R8 与验收 A1–A8。

---

## 1. Goal（目标架构）

**一条翻译层 + 一条写入层，两个入口。**

```
入口 A（主）：资源管理器 --拖拽(Shift)--> DSH 面板(webview DOM)
入口 B（兜底）：资源管理器 --右键菜单--> 扩展宿主
        │                                   │
        └──────────────┬────────────────────┘
                       ▼
            翻译层 src/referenceDrop.ts（纯函数、可单测）
              负载 → 候选路径 → 校验(file/dir) → 工作区相对 → `@` 引用文本
                       ▼
            写入层 media/bridge-client.js: insertReferenceText()
              定位 [data-composer-input] → 合成 paste 事件 → 兜底 execCommand → 回报结果
                       ▼
            失败降级：宿主写剪贴板 + 中文提示（不谎报成功）
```

**为什么这样分层**：照抄同族项目被验证过的那条纪律——**翻译层纯函数化（用单测锁语法）、写入层只有一个函数**。区别在于写入面：Obsidian 有 `<webview>.insertText()`，VS Code 没有，所以我们改用"合成 paste 事件喂给上游自己的粘贴命令"。

## 2. Facts（已核实事实，支撑每一处"改为…"）

| # | 事实 | 来源 |
|---|---|---|
| F1 | composer = Lexical，根元素 `[data-composer-input]`（`role=textbox`/`aria-multiline`/`contenteditable`）；`[data-phase]` 有歧义、类名是哈希 | `05-事实` §composer 结构 |
| F2 | 上游把 `PASTE_COMMAND` 绑在编辑器根元素；处理器读 `clipboardData.getData("text/plain")` → `handlers.pasteText` → `keyboard.paste()`（`discrete: true`，**同步提交**）；不查 `isTrusted` | `05-事实`；`CONV` L4589-4600 / L15258-15273 / L12825-12836 / L12701 |
| F3 | chip 的 `serialize()` 是恒等函数 → **纯文本 `@path` 与 picker 产物逐字节相同**，无任何端侧解析 | `05-事实` §落文本 vs 结构化节点 |
| F4 | `@` 语法：工作区相对 + 正斜杠、`@"含空格"`、目录尾随 `/`、空格分隔、含 `"`/控制字符跳过 | `05-事实`；上游 `dsh-file-reference/lib/types/grammar.js` |
| F5 | DSH 自带拖放判据 `types.includes("Files")`，只收真实文件（转附件）；字符串拖拽直接 `return` 且不 `preventDefault` | `CONV` L15258-15273 邻近 `dsh-client-ui-attachment` |
| F6 | 窗口内任何 `dragstart` 会让 webview iframe `pointer-events:none`，**只有按住 Shift 恢复** | `04-事实` §证据表；VS Code PR #209211 |
| F7 | 资源管理器拖拽**不产生 `File` 对象**；路径在 `application/vnd.code.uri-list`（全量含目录）/`text/uri-list`（仅首个）/`ResourceURLs`/`CodeFiles`/`CodeEditors`/`text/plain` | `04-事实` §DataTransfer |
| F8 | **没有**把 webview drop 交给扩展宿主的官方 API | `@types/vscode` 1.105.0 全文检索 |
| F9 | 扩展已有传输桥（`http`/`ws`/`clipboard` + `webview.onDidReceiveMessage`），两个承载面共用 | `src/bridgeHost.ts`、`src/dshUi.ts` |
| F10 | `workspaceRoot()` = DSH 子进程 cwd = 引用路径的解析根 | `src/commands.ts:10`、`src/extension.ts:119` |

## 3. Gap（要解决的就是这个差集）

1. 页面里**没有任何拖拽处理**：`src/**`、`media/**` 全文检索 `drop|dragstart|dataTransfer` 无命中（F6/F7 的负载没人接）。
2. 扩展宿主**收不到**资源管理器拖拽路径（F8），因此必须有"页面 → 宿主"的新协议消息。
3. 页面**没有写入 composer 的能力**（F2 的入口没被利用）。
4. 未按 Shift 时 VS Code 会吞掉拖拽（F6），且 #237958 报告 Shift 也可能失效 → **必须另设兜底入口**。

## 4. Call-site Audit（契约变更审查）

| 契约 | 变更 | 调用点核对 | 判定 |
|---|---|---|---|
| `BridgeHost` 协议（webview↔host） | **新增** 3 个消息类型（`dsh-context-drop` / `dsh-context-insert` / `dsh-context-insert-result`）；**不改**既有的 `http`/`ws-*`/`clipboard-*`/`server-status` | `bridgeHost.ts`(默认分支忽略未知)、`dshPanel.ts:84`、`chatView.ts:65` 各自 `onDidReceiveMessage` | ✅ 兼容（新增分支，未知类型仍被忽略） |
| `assembleDocument(opts)` | 新增**可选** `dropHint?: string`，仅多注入一个 JSON 字段 | `dshPanel.ts:144`、`chatView.ts:140`、`test/documentAssembly.test.js` | ✅ 兼容（可选参数，默认不注入） |
| `DshPanel` / `DshChatView` | **新增**方法 `isVisible`/`postMessage`，不改既有方法签名 | 两处构造点仅在 `extension.ts` | ✅ 兼容 |
| `SessionPanelManager` | **新增** `visiblePanel()`，不改既有方法 | `extension.ts`、`test/sessionPanels.test.js`（`require` 编译产物） | ✅ 兼容 |
| `registerCommands(ctx, mgr, targets)` | `CommandTargets` 新增 `addToContext` 成员 → **必填** | 唯一调用点 `extension.ts:172` | ⚠️ 契约变更：同一提交内补齐调用方（已核对，只有一处） |
| `media/bridge-client.js` | 新增拖拽段；既有 fetch/ws/clipboard/matchMedia 行为不动 | `test/bridgeClient.test.js`（回归断言） | ✅ 兼容 |

## 5. 架构与数据契约

### 5.1 消息协议（新增三条）

| 方向 | 消息 | 载荷 |
|---|---|---|
| webview → host | `dsh-context-drop` | `{ payload: { [mime]: string } }`——**原样回传**，不做任何解析（解析留在可单测的 TS 侧） |
| host → webview | `dsh-context-insert` | `{ text: string }`——已翻译好的 `@` 引用文本 |
| webview → host | `dsh-context-insert-result` | `{ ok: boolean, text: string }`——`text` 回显，供失败时写剪贴板 |

### 5.2 负载解析优先级（`src/referenceDrop.ts`）

| 顺序 | key（大小写不敏感） | 解析 |
|---|---|---|
| 1 | `application/vnd.code.uri-list` | `\r\n` 切行，跳过 `#` 注释，`file:` URI → 路径（剥离 `#L3,5`） |
| 2 | `text/uri-list` | 同上（可能只有第一条） |
| 3 | `resourceurls` | JSON 数组 → URI |
| 4 | `codefiles` | JSON 数组 → **已是 fsPath** |
| 5 | `codeeditors` | JSON 数组 → `resource` URI |
| 6 | `text/plain` | 逐行；绝对路径直接用，相对路径按工作区根拼接（**最后兜底**） |

去重（Windows 大小写不敏感）→ 上限 20 条 → 逐条 `workspace.fs.stat` 判文件/目录 → 相对化 → 生成引用。

### 5.3 `@` 引用语法（与上游 `formatFileMention` 一致）

`@src/a.ts` ｜ `@"src/a b.md"` ｜ 目录 `@src/utils/` ｜ 含 `"`/控制字符 → **跳过**该条（不转义）｜ 空格分隔 ｜ 上限 20。

### 5.4 写入层（`media/bridge-client.js`）

1. **只接管"资源类"拖拽**：types 含 `application/vnd.code.uri-list`/`resourceurls`/`codefiles`/`codeeditors`/`text/uri-list`，且**不含** `Files`（OS 真实文件让给 DSH 附件通道）、**不含** `vscode-editor-data`（编辑器选区不是文件引用）。其余一律不 `preventDefault`、不介入 → R6/R8 不回归。
2. `dragover` 时显示提示浮层「松开即添加为 @引用」，`dragleave`/`dragend`/`drop` 收起。
3. `drop` 时把 `{ [mime]: raw }` 回传宿主。
4. 收到 `dsh-context-insert` 后：定位 `[data-composer-input]` → 判 `contenteditable !== "false"` → `focus({preventScroll:true})` → **合成 `paste`**（`new DataTransfer()` + `new ClipboardEvent("paste",{clipboardData})`）→ DOM 文本未变则退到 `execCommand("insertText")` → 仍未变则 60ms 后复查一次 → 回报 `ok`。

### 5.5 兜底入口（入口 B）

`explorer/context` 菜单项 → 命令把选中的 `vscode.Uri[]` 走**同一条翻译层** → 投给"可见的 DSH 面"（次级侧边栏视图优先，否则最新的编辑器面板）→ 同一条写入层。

> **超出原始诉求的声明**：用户只要求拖拽。加这一项是因为 F6/#237958 表明拖拽路径可能被 VS Code 挡掉；没有它，"目录树 → composer"就没有任何保证可用的通路。若用户不要，删除 `contributes.menus` + 该命令即可（10 行）。

## 6. 文件变更清单

| 文件 | 变更 | 类型 |
|---|---|---|
| `src/referenceDrop.ts` | **新增**：vscode-free 纯逻辑（解析/语法/相对化/上限/去重） | 新增 ~150 行 |
| `media/bridge-client.js` | 新增拖拽接管段 + 写入函数 | +~120 行 |
| `src/dshUi.ts` | 新增 `deliverDropToComposer` / `deliverUrisToComposer` / `handleInsertResult` | +~70 行 |
| `src/dshPanel.ts` / `src/chatView.ts` | 消息分支 + `isVisible`/`postMessage` | 各 +~20 行 |
| `src/sessionPanels.ts` | `visiblePanel()` | +~10 行 |
| `src/extension.ts` | 组装：`addToContext` 命令实现 + 传给 `registerCommands` | +~25 行 |
| `src/commands.ts` | 注册 `addToContext` 命令；`CommandTargets` 加成员 | +~15 行 |
| `src/documentAssembly.ts` | 可选 `dropHint` 注入到 `__DSH_BRIDGE__` | +3 行 |
| `package.json` | 命令 + `explorer/context` 菜单 + `version` 0.5.0 | +~12 行 |
| `package.nls.json` | 命令标题（中文） | +1 键 |
| `src/i18nStrings.ts` | 新增文案键（成功/失败/无面/无路径） | +~8 键 |
| `test/referenceDrop.test.js` | **新增**：语法 / 优先级 / 相对化 / 上限 / 跳过 | 新增 |
| `test/bridgeClient.test.js` | 扩展：臂条件 + 写入选路 | +~60 行 |
| `test/sessionPanels.test.js` | 扩展：`visiblePanel()` | +~20 行 |
| `README(.en).md` / `CHANGELOG(.en).md` / `dsh-baseline.json` | 发布同步（含 **Shift** 与"纯文本引用"两处如实说明） | 文档 |

## 7. 风险与对策

| # | 风险 | 影响 | 对策 |
|---|---|---|---|
| K1 | 用户不知道要按 **Shift**，以为功能坏了（不按 Shift 时文件被编辑器打开） | 体验落差 | README + CHANGELOG 写明；页面内拖拽提示浮层；`08-验证` 给出一分钟自测步骤 |
| K2 | 跨源 iframe 里 `getData` 可能被 Chromium 过滤（规范无跨源条款，whatwg/html#12807 称不可靠） | 入口 A 读不到路径 | ① 六键优先级兜底；② 读不到 → **明确中文提示**（不静默）；③ 入口 B 保底 |
| K3 | #237958：1.96.3 上"按 Shift 也捕不到"（open） | 入口 A 在部分版本完全失效 | 入口 B 保底；`07-待办` 登记真机复核 |
| K4 | 合成 `paste` 被上游后续版本改掉（`PASTE_COMMAND` 绑定/字段变化） | 写入失效 | 写入层有 `execCommand` 兜底 + 结果回报（失败会提示，不静默）；登记进上游巡检面 |
| K5 | 误接管编辑器选区拖拽 / OS 文件拖拽 | 破坏既有能力 | 臂条件显式排除 `Files` 与 `vscode-editor-data`；单测锁死 |
| K6 | 拖入整个目录/大量文件刷爆输入框 | 上下文爆炸 | 上限 20 条（与上游/同族项目一致） |
| K7 | 工作区外的文件 | 引用无法解析 | 保留绝对路径（可见降级），并在文档说明；不做静默丢弃 |
| K8 | 页面内提示浮层的配色与 DSH 主题 | 可读性 | 中性半透明深色药丸 + 白字（深浅主题均可读）；**这是对"禁止硬编码颜色"的有意偏离**，理由写在代码注释里（我们无法访问 VS Code 主题变量，因为运行在上游页面里） |

## 8. 验证方案

| 层次 | 怎么验 |
|---|---|
| 静态 | `npm run compile`（零 issue）、`node --check media/bridge-client.js` |
| 单测 | `npm test`：`test/referenceDrop.test.js`（语法/优先级/上限/跳过/相对化）、`test/bridgeClient.test.js`（臂条件 + 写入选路 + 既有回归）、`test/sessionPanels.test.js`（选面） |
| 真机（用户 1 分钟） | `08-验证` A 组：拖 1 个文件（按住 Shift）/拖 3 个 / 草稿不丢 / 侧边栏形态 / 不按 Shift 的表现 / 右键入口 / OS 文件拖拽仍走附件 |
| 兼容 | VS Code 1.105.1 + Cursor；`engines.vscode` 不动 |

## 9. 被否决的方案（避免下一轮重开）

| 方案 | 否决理由 |
|---|---|
| 复刻 Cursor 的 chip（结构化节点） | 上游没有公开插入 chip 的入口（`slash/input-insert-reference` 只在 cordis 插件作用域内），而 F3 证明纯文本**功能等价**——投入产出为负 |
| 侧边栏加 TreeView 当投放区 | 官方支持、可靠，但**新增一块常驻 UI**且落点不是 composer；本轮先不做，若入口 A 真机不通过则下一轮启用（`07-待办`） |
| DSH 客户端插件（`setDraft`） | 要装进 `$DSH_HOME`，上游一升级就坏；同族项目已因此否决 |
| 直投 `session/prompt` RPC | 会**立刻起一轮对话**（语义是"替用户发问"），不是"填草稿" |
| 直接在 webview 里改 DOM 文本 | 下一次 Lexical commit 会覆盖 |

---

*关联文档：[02-需求](02-需求_目录树拖拽到Composer.md) ｜ [03-分析](03-分析_参考项目与可行性.md) ｜ [04-事实](04-事实_webview拖拽能力核实.md) ｜ [05-事实](05-事实_DSH-Composer与提及机制.md) ｜ [07-实施计划](07-实施计划_目录树拖拽到Composer.md)*
