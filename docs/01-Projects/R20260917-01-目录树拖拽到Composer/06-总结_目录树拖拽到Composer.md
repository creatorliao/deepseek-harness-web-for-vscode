# 总结：目录树拖拽到 Composer

**日期**: 2026-09-17 ｜ **状态**: 已收口（代码 + 发版 + 装机完成；真机鼠标验收待用户）
**定位**: 记录本轮"做了什么、改了什么、结论是什么"。

---

## 1. 一句话结论

**做到了，但不是像素级复刻 Cursor**：从资源管理器拖文件到 DSH 输入框会写入 `@工作区相对路径`，与用 `@` 补全选中该文件**功能等价**（发给模型的消息逐字节相同）；代价是 VS Code 要求**按住 Shift**（webview 拖拽的官方放行方式），且写入的是纯文本而不是 chip。为了不被这个前提卡死，额外提供**资源管理器右键「添加到 DSH 输入框（@ 引用）」**作为无前提的等价入口。

## 2. 交付物

| 类型 | 内容 |
|---|---|
| 代码 | `src/referenceDrop.ts`（新增，翻译层）、`media/bridge-client.js`（拖拽接管 + 写入层）、`src/dshUi.ts`（宿主胶水）、`src/dshPanel.ts` / `src/chatView.ts` / `src/sessionPanels.ts` / `src/extension.ts` / `src/commands.ts` / `src/documentAssembly.ts` / `src/i18nStrings.ts` |
| 清单 | `package.json`（新命令 + `explorer/context` 菜单 + 0.5.0）、`package.nls.json` |
| 测试 | `test/referenceDrop.test.js`（新增 16 条）、`test/bridgeClient.test.js`（+6 条）、`test/sessionPanels.test.js`（+2 条） |
| 文档 | 本主题夹 `01`–`08`；`README(.en).md` 功能与兼容矩阵；`CHANGELOG(.en).md` 0.5.0；`docs/02-Areas/dsh-baseline.json`（版本 + 新脆弱点） |
| 产物 | `dist/creatorliao.deepseek-harness-for-vscode-0.5.0.vsix`（313 KB） |

## 3. 关键决策（含被否决项）

| 决策 | 理由 | 备选与否决原因 |
|---|---|---|
| 写入**纯文本 `@path`**，不复刻 chip | 上游 chip 的 `serialize()` 就是这串文本（`10-事实` §落文本 vs 结构化节点），复刻无功能收益；上游也未开放程序化插入 chip 的入口 | 客户端插件 `slash/input-insert-reference`：要装进 `$DSH_HOME`，上游一升级就坏 |
| 用**合成 `paste` 事件**写 composer | 上游在编辑器根元素上绑了 `PASTE_COMMAND`，处理器不检查 `isTrusted`；这条路径就是"用户粘贴"本身，Lexical 状态一致 | 直接改 DOM：会被下一次 commit 覆盖；`session/prompt` RPC：会立刻替用户发问 |
| 翻译层放**扩展宿主**（TS、纯函数） | 语法可单测；webview 侧只做 DOM 与 DataTransfer（无法单测的部分最小化） | 全放注入脚本：语法只能靠手感验证 |
| 额外提供**右键入口** | 拖拽入口有 Shift 前提 + 一条 open 的 VS Code 缺陷（#237958），不能是唯一通路 | 只做拖拽：用户可能永远用不上 |
| 只接管**资源类**拖拽 | 保住 DSH 自带的"OS 真实文件 → 附件"与编辑器选区拖拽（R8） | 全部接管：会破坏既有能力 |
| 上限 **20** 条引用 | 防误拖整个目录刷爆上下文；与上游/同族项目一致 | 不设上限：上下文爆炸 |

## 4. 与参考项目（Obsidian 版）的关系

同族项目 `deepseek-harness-web-for-obsidian` 已经做过同一件事，本轮**照抄了它被验证过的两条纪律**（翻译层纯函数 + 单测锁语法；写入层只有一个函数 + 失败降级到剪贴板 + 诚实提示），但**写入面必须换**：它用 Electron `<webview>.insertText()`，VS Code 没有等价 API，于是改用"合成 paste 喂给上游自己的粘贴命令"。

⚠️ 同族项目的验收清单同样是空的（其"宿主能否收到 drop""insertText 能否落进输入框"两跳未实测）——所以本轮**不把它的存在当作可行性证据**，而是自己重新取证（`09-事实` / `10-事实`）。

## 5. 遗留

见 [07-待办](07-待办_目录树拖拽到Composer.md)：核心是 **T11 真机鼠标验收**（本机无 GUI 自动化），以及"若入口 A 真机不通过则启用 E3（TreeView 投放区）"的预案。

---

*关联文档：[05-验证](05-验证_目录树拖拽到Composer.md) ｜ [08-分析](08-分析_参考项目与可行性.md)*
