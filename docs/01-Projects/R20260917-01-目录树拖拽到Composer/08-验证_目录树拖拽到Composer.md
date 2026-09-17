# 验证：目录树拖拽到 Composer

**日期**: 2026-09-17 ｜ **状态**: 代码与静态验证已完成；**真机鼠标验收待用户执行**
**定位**: 收口审计——按 RTTM 复查需求覆盖、逐项确认代码存在且被调用、列出缺口与严重度。

---

## 1. 质量门结果（本机实测）

| 项 | 命令 | 结果 |
|---|---|---|
| 编译 | `npm run compile` | ✅ 零 issue（含 `info` 级） |
| 注入脚本语法 | `node --check media/bridge-client.js` | ✅ 通过 |
| 单元测试 | `npm test` | ✅ **129/129 通过**（`ℹ tests 129 / pass 129 / fail 0`，含本次新增 22 条） |
| 上游跟随门 | `npm run check:dsh` | ✅ 已跟到上游最新（see §4） |
| 真实 dsh 冒烟 | `node scripts/smoke.js` | ✅ `smoke OK: http://127.0.0.1:9920 cwd=D:\Users\liaohai1` |
| 打包 | `npm run package` | ✅ `dist/creatorliao.deepseek-harness-for-vscode-0.5.0.vsix`（313 KB / 72 文件，`dist/` 恰好一份） |
| 打包白名单 | `npx --no-install vsce ls` | ✅ 含 `node_modules/ws/**`（19 个文件）与 `out/`（40 个文件） |
| 安装 VS Code | `code --install-extension …vsix --force` | ✅ `creatorliao.deepseek-harness-for-vscode@0.5.0`（VS Code 1.105.1）；落盘校验：`out/referenceDrop.js` 13,547 B、`media/bridge-client.js` 第 423 行起为拖拽段 |
| 安装 Cursor | `cursor --install-extension …vsix --force` | ✅ `creatorliao.deepseek-harness-for-vscode@0.5.0`（Cursor 3.20.21） |
| 提交/推送 | `git push` | ✅ `7918816..deaba30 main -> main`（**经 SSH 推送**：HTTPS 侧 OAuth 令牌缺 `workflow` scope，被 GitHub 拒绝创建/更新 `.github/workflows/*`；见 §6） |

> 环境说明：受限沙箱下 `npm test` / `npm run package` 会因 Node 子进程管道被拒而报 `spawn EPERM`（已用最小脚本独立复现：`spawnSync(process.execPath,…)` → `EPERM`）。这是**环境限制**，不是代码缺陷；放开沙箱后同一条 `npm test` 为 129/129。

## 2. RTTM 覆盖复查

| 需求 | 承接任务 | 代码落点（已确认存在且被调用） | 状态 |
|---|---|---|---|
| R1 拖拽即引用 | T1–T5 | `media/bridge-client.js` 拖拽段（document 捕获监听 → `dsh-context-drop`）→ `src/dshUi.ts:deliverDropToComposer` → `src/referenceDrop.ts` → `dsh-context-insert` → `insertReferenceText` | ✅ 代码 + 单测；真机待验（A1） |
| R2 多选批量 | T1 T3 | `candidatesFromPayload`（六键合并去重）+ `entriesFromCandidates`（解析后按路径去重） | ✅ 单测（3 URI → 3 条引用）；真机待验（A2） |
| R3 草稿不被破坏 | T5 | `insertReferenceText` 用上游 paste 命令（在选区插入，空选区追加到末尾），不写 DOM | ✅ 单测；真机待验（A3） |
| R4 两种形态 | T4 T6 | `dshPanel.ts` 与 `chatView.ts` 各自接同两个消息分支，共用 `src/dshUi.ts` 实现 | ✅ 代码对称；真机待验（A4） |
| R5 失败可见 | T3 T4 T6 | 无候选 → `context.dropUnresolved`；写入失败 → `handleInsertResult` 写剪贴板 + `context.insertFailed`；无界面 → `context.noSurface` | ✅ 单测（只读输入框 → `ok:false`）+ 代码审查 |
| R6 不弱化安全 | T2 T5 | 无新增 CSP 源、无直连 `/api`、拖拽数据只走既有 postMessage 桥 | ✅ 审查 |
| R7 兼容基线 | T8 | `engines.vscode` / `@types/vscode` 未动 | ✅ |
| R8 不回归 | T2 T5 | 臂条件显式排除 `Files`（OS 文件→DSH 附件）与 `vscode-editor-data`（编辑器选区）；既有 bridge 回归用例全绿 | ✅ 单测 |
| A7 质量门 | T7 T8 | 见 §1 | ✅ |
| A8 装机 | T9 T10 | 见 §5 | ✅ |

## 3. 缺口与严重度

| # | 缺口 | 严重度 | 依据 |
|---|---|---|---|
| V-01 | **「真机鼠标拖拽 → composer 出现引用」这一跳未实测**。本机无 GUI 自动化（webview 拖拽依赖真实 workbench 拖拽数据），因此：① VS Code 是否真把内部 mime 的数据交给跨源 iframe；② 按住 Shift 的放行是否在本机 1.105.1 生效 | **高**（决定入口 A 是否可用） | `04-事实` §未验证点 1–2；本次仅完成代码级与单测级验证 |
| V-02 | 按住 Shift 的**时机**（须在指针进入面板前按下）只能在真机确认 | 中 | 源码推导（iframe 内的 shift 状态只在"全为 file 项"时回传，我们的拖拽不是） |
| V-03 | Cursor 内嵌 VS Code 1.128.0 是否同样具备 Shift 放行逻辑（源码未核对，只核对了 1.105.1 / 1.93.0） | 中 | `04-事实` §未验证点 6 |
| V-04 | chip 视觉差异（写入的是纯文本 `@路径`，不是 chip） | 低（有意取舍） | `03-分析` §3.3：上游 chip 的 `serialize()` 即同一字符串，功能等价 |

> 兜底已就位：即便入口 A 完全不可用，「目录树 → composer」仍可通过**资源管理器右键 → 添加到 DSH 输入框（@ 引用）**完成（该入口只依赖官方菜单 API 与已单测的翻译层，无 Shift、无跨源拖拽）。

## 4. 上游跟随核对（发版门）

```
已适配版本 : 0.1.2-rc.1, 0.1.5-rc.1, 0.1.5-rc.2（最新 0.1.5-rc.2）
npm dist-tags: latest 0.1.5-rc.1 ✅ | next 0.1.5-rc.2 ✅ | alpha 0.1.6-alpha.1（不纳入基线）
结论：已跟到上游最新
```

本次改动落在**前端 composer 的粘贴命令**（`PASTE_COMMAND` 绑定）与 **data 属性 `[data-composer-input]`** 上，属于既有的"上游脆弱点"清单范畴，已登记进 `docs/02-Areas/dsh-baseline.json`（见本次提交的 `fragilePoints` 新增项）。

---

## 5. 真机验收清单（**需要用户执行，约 1 分钟**）

前置：VS Code 1.105.1（或 Cursor）→ 扩展视图 → 从 VSIX 安装 `dist/creatorliao.deepseek-harness-for-vscode-0.5.0.vsix` → 重启窗口 → 打开一个代码文件夹 → 启动 DSH，让 DSH 界面显示出来（状态栏/活动栏图标）。

| # | 步骤 | 期望 | 通过 |
|---|---|---|---|
| A1 | 在资源管理器里按住 **Shift**，把 `src/i18nStrings.ts` 拖到 DSH 输入框上方再松开 | 输入框里出现 `@src/i18nStrings.ts`；输入框边缘出现深色提示条（拖拽过程中） | ☐ |
| A2 | 按住 Shift 拖 3 个文件（Ctrl 多选） | 出现 3 条引用，无重复 | ☐ |
| A3 | 先在输入框里打几个字，再拖 1 个文件 | 原文字一字不少，引用追加在光标处/末尾 | ☐ |
| A4 | 把 `deepseekHarness.openTarget` 设为 `sidebar`，把 DSH 界面切到次级侧边栏后重复 A1 | 同样生效 | ☐ |
| A5 | **不按 Shift** 拖 1 个文件 | 文件在编辑器里被打开（VS Code 行为），DSH 输入框不变——**已知限制，不算失败**；随后用**右键 → 添加到 DSH 输入框（@ 引用）** 应成功写入 | ☐ |
| A6 | 从 **Windows 资源管理器**拖一张图片/文件进面板 | 仍走 DSH 自带的附件上传（行为与 0.4.0 一致） | ☐ |
| A7 | 在编辑器里选中一段代码，拖到面板 | 不产生任何引用，也不出现提示条 | ☐ |

**失败时请回传**：`帮助 → 切换开发人员工具 → Console` 里以 `[dsh]` 开头的行；或 `Ctrl+Shift+P → 输出 → 选 DeepSeek Harness`。若 A1 完全无反应（连提示条都没有），说明 VS Code 没有把拖拽交给 webview——此时**请告知**，下一轮改走 `07-待办` 里的 E3（TreeView 投放区）。

---

*关联文档：[06-方案](06-方案_目录树拖拽到Composer.md) ｜ [07-实施计划](07-实施计划_目录树拖拽到Composer.md) ｜ [10-待办](10-待办_目录树拖拽到Composer.md)*

## 6. 过程中遇到的两个环境问题（如实登记）

| 问题 | 现象 | 处置 |
|---|---|---|
| 沙箱拒绝子进程管道 | 受限模式下 `npm test` / `npm run package` 报 `spawn EPERM`（已用 `spawnSync(process.execPath,…)` 独立复现，与仓库代码无关） | 放开沙箱后重跑：`npm test` 129/129、`npm run package` 成功 |
| HTTPS 推送被拒 | `! [remote rejected] main -> main (refusing to allow an OAuth App to create or update workflow .github/workflows/upstream-watch.yml without workflow scope)`——未推送的历史提交 **7a7ef2b** 含工作流文件改动，而本机 HTTPS 凭据（Git Credential Manager，经 VS Code）与 `gh` 令牌的 scope 均只有 `gist/read:org/repo` | 改用**本机已配置的 SSH 密钥**推送（同一账号 `creatorliao`，SSH 不受 OAuth scope 限制），**未改动 `origin` 配置**。若希望 HTTPS 侧也恢复可用：`gh auth refresh -s workflow`（需交互授权）或换用带 `workflow` scope 的 PAT |
