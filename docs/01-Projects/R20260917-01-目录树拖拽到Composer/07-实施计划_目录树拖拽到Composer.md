# 目录树拖拽到 Composer — 实施计划

**日期**: 2026-09-17 ｜ **来源**: `02-需求` / `03-分析` / `06-方案`
**定位**: 自包含的执行清单（执行者不必回读方案）。状态标记：`✅` 完成且验证 ｜ `❌` 受阻 ｜ `⏭️` 本轮不做 ｜ `⏳` 未开始

## RTTM（需求 → 任务 → 验证）

| 需求 | 任务 | 验证方式 |
|---|---|---|
| R1 拖拽即引用（AI 确实读到文件） | T1 T2 T3 T4 T5 | 单测（语法/优先级）+ 真机 A1 |
| R2 多选批量 | T1 T3 | 单测（3 条 URI → 3 条引用）+ 真机 A2 |
| R3 草稿不被破坏、焦点回输入框 | T5 | 单测（paste 在选区插入）+ 真机 A3 |
| R4 两种形态都生效 | T6 | 真机 A4（两种 openTarget） |
| R5 失败必须可见 | T3 T4 T6 | 单测（无候选 → 不投递且提示）+ 真机 A5 |
| R6 不弱化安全基线 | T2 T5 | 代码审查：无新 CSP 源、无直连 `/api`、无外发 |
| R7 兼容 1.105.1 / Cursor | T8 | `compile` + 真机 A8 |
| R8 不回归既有行为 | T2 T5 | 既有单测全绿 + 真机 A6（OS 文件拖拽仍走附件） |
| A7 质量门 | T7 T8 | `npm run compile` 零 issue、`npm test` 全绿、`node --check` |
| A8 装机 | T9 T10 | VS Code / Cursor 扩展列表显示 0.5.0 并可用 |

## 依赖顺序

```
T1(referenceDrop 纯逻辑) ──┬─> T3(宿主胶水 dshUi) ──> T4(两个面接消息) ──> T6(右键入口) ──> T7(单测补齐)
                           │                                                    │
T2(bridge-client 拖拽段) ──┴────────────────────────────────────────────────────┘
T7 ──> T8(编译/测试/打包/升版) ──> T9(安装 VS Code) ──> T10(安装 Cursor)
```

---

### T1 — `src/referenceDrop.ts`：翻译层（vscode-free 纯逻辑） ✅

- 文件：`src/referenceDrop.ts`（新增）
- 子项：
  - `MAX_DROP_REFERENCES = 20`、`DropKind = "file" | "folder"`
  - `toReference(path, kind)`：空白加引号、目录尾随 `/`、含 `"`/控制字符返回 `null`
  - `referencesFromEntries(entries)`：空格连接、超限截断
  - `pathsFromDropPayload(payload)`：六键优先级（uri-list → text/uri-list → resourceurls → codefiles → codeeditors → text/plain）+ 去重
  - `workspaceRelative(absPath, root)`：Windows 大小写不敏感、反斜杠→`/`、工作区外返回绝对路径
- **完成标准**：`npm run compile` 零 issue；被 T7 的单测覆盖。

### T2 — `media/bridge-client.js`：拖拽接管 + 写入 composer ✅

- 文件：`media/bridge-client.js`
- 子项：
  - 臂条件 `isResourceDrag(types)`：命中资源类 mime 且**不含** `Files` / `vscode-editor-data`
  - `dragenter/dragover` → `preventDefault` + 显示提示浮层；`dragleave/dragend/drop` → 收起
  - `drop` → `postMessage({type:"dsh-context-drop", payload})`
  - `dsh-context-insert` → `insertReferenceText(text)`：`[data-composer-input]` → 合成 paste → `execCommand` 兜底 → 60ms 复查 → `postMessage({type:"dsh-context-insert-result", ok, text})`
- **完成标准**：`node --check media/bridge-client.js` 通过；既有 bridge 回归测试全绿。

### T3 — `src/dshUi.ts`：宿主胶水 ✅

- 文件：`src/dshUi.ts`、`src/documentAssembly.ts`（可选 `dropHint` 注入）
- 子项：`deliverDropToComposer(webview, root, payload)`、`deliverUrisToComposer(target, uris)`、`handleInsertResult(msg)`
- **完成标准**：编译零 issue；两个承载面共用同一实现（不许复制）。

### T4 — 两个承载面接消息 ✅

- 文件：`src/dshPanel.ts`、`src/chatView.ts`、`src/sessionPanels.ts`
- 子项：消息分支 `dsh-context-drop` / `dsh-context-insert-result`；`isVisible`/`postMessage`；`SessionPanelManager.visiblePanel()`
- **完成标准**：`test/sessionPanels.test.js` 全绿（含新增用例）。

### T5 — 写入正确性细节 ✅

- 子项：`contenteditable === "false"` 时不写入；`focus({preventScroll:true})`；插入文本首尾补空格（避免与既有文本粘连导致 `@` 不被识别）；失败时把文本回显给宿主
- **完成标准**：`test/bridgeClient.test.js` 新增用例覆盖"合成 paste 被调用且载荷为预期文本"。

### T6 — 兜底入口：`explorer/context` 菜单 ✅

- 文件：`package.json`、`package.nls.json`、`src/commands.ts`、`src/extension.ts`
- 子项：命令 `deepseek-harness-for-vscode.addToContext`（`(uri, uris)`），组 `navigation@10`；无可用面时中文提示
- **完成标准**：`vsce ls` 打包清单正常；真机 A5b 可点。

### T7 — 单测 ✅

- 文件：`test/referenceDrop.test.js`（新增）、`test/bridgeClient.test.js`、`test/sessionPanels.test.js`
- **完成标准**：`npm test` 全绿。

### T8 — 质量门 + 升版 + 打包 ✅

- 子项：`compile` / `test` / `node --check` / `npm run package`；版本 `0.4.0 → 0.5.0`；`CHANGELOG(.en)`、`README(.en)`、`dsh-baseline.json`
- **完成标准**：`dist/` 下**恰好一份** `creatorliao.deepseek-harness-for-vscode-0.5.0.vsix`。

### T9 — 安装到 VS Code ✅

- 命令：`code --install-extension dist/...vsix --force`
- **完成标准**：`code --list-extensions --show-versions` 显示 0.5.0。 → 实测 ✅（VS Code 1.105.1）

### T10 — 安装到 Cursor ✅

- 命令：`cursor --install-extension dist/...vsix --force`
- **完成标准**：Cursor 扩展列表显示 0.5.0（或安装命令返回成功）。 → 实测 ✅（Cursor 3.20.21）

### T11 — 真机拖拽验收（**留给用户**） ⏳

- 见 `08-验证` A 组；本机无 GUI 自动化，无法代跑。
- **完成标准**：用户回报 A1–A6。

---

*关联文档：[06-方案](06-方案_目录树拖拽到Composer.md) ｜ [08-验证](08-验证_目录树拖拽到Composer.md)*
