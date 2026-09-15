# DeepSeek Harness for VS Code

[English](README.en.md) | **中文**

[![License](https://img.shields.io/github/license/creatorliao/deepseek-harness-for-vscode)](LICENSE)
[![CI](https://github.com/creatorliao/deepseek-harness-for-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/creatorliao/deepseek-harness-for-vscode/actions)
[![GitHub Release](https://img.shields.io/github/v/release/creatorliao/deepseek-harness-for-vscode)](https://github.com/creatorliao/deepseek-harness-for-vscode/releases/latest)
[![Open VSX Version](https://img.shields.io/open-vsx/v/creatorliao/deepseek-harness-for-vscode)](https://open-vsx.org/extension/creatorliao/deepseek-harness-for-vscode)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/creatorliao/deepseek-harness-for-vscode)](https://open-vsx.org/extension/creatorliao/deepseek-harness-for-vscode)

一键启动 **DeepSeek Harness**，把它的完整 Web UI 内嵌进 VS Code（及兼容 fork 的 Antigravity IDE）——在同一个窗口里跑 DSH Agent、写代码，与浏览器打开的实例**共享同一份状态**。

## 截图

![DeepSeek Harness embedded in Antigravity](media/antigravity.jpg)

## 功能

- **在编辑器里完成一切**：在 **VS Code 或 Antigravity** 中边写代码边用 DeepSeek Harness，无需在 IDE 与浏览器标签页之间来回切换就能看到 Agent 工作。
- **Agent 生态中的一员**：VS Code / Antigravity 可安装多个 coding agent 扩展，各自由不同 LLM 驱动（如 Claude Code、ChatGPT…）；本扩展就是其中之一——**DeepSeek Harness Agent**，与其它 Agent 在同一 IDE 里并存，可让多个 Agent 同时跑同一任务、**交叉评审，规避单一 LLM 的短板**。
- **一键启动 / 停止**：扩展托管 `dsh web` 子进程（端口自动分配）。入口：活动栏 DSH 图标（侧边栏启动器）、状态栏按钮、命令面板。
- **默认就在右侧栏，像一个聊天搭子**：DSH 界面默认开在 **VS Code 右侧的次级侧边栏**（Secondary Side Bar），结构上不会占用编辑器标签页，也不会被误拖走；需要并排对比或宽界面干重活时，用命令 `在编辑器标签页打开` 即可，两种形态可随时切换（见下方配置）。
- **编辑器标签页内嵌 Web UI（可选形态）**：完整 DSH 前端（会话、工作区、设置、插件、Goal、Workflow）也能以常规编辑器标签页呈现，与文件编辑并存——**永不遮挡资源管理器树**。
- **与浏览器共享实例**：默认使用你的 `~/.dsh`，会话与设置和浏览器 UI 互通。
- **当前文件夹即工作区**：DSH 默认项目目录 = 你打开的文件夹。
- **工作区对齐**：DSH 的 workspace 锚点跟随 IDE 工作区——切换文件夹关闭旧面板、冷启动；重载同一工作区自动重启服务并恢复面板；内嵌 UI 始终显示**当前文件夹**（而非最近活跃的那个）。
- **会话管理器**：侧边栏列出全部活跃会话（标题 + 相对活跃时间），支持内联重命名与归档；**可展开的归档区**让旧会话整洁收纳；`＋新建会话` 打开绑定新会话的堆叠面板，多个面板各自独立对话。
- **点图标自动启动**：点击活动栏图标，dsh 未运行时自动启动。
- **dsh 版本检查 + 一键升级**：启动器显示 "有新版本：x.y.z →"（有新版时，文案随界面语言本地化）；点击后按你的安装方式（npx / npm 全局 / nvm）给出对应升级命令，预填进终端（24 小时检查门、离线静默）。
- **剪贴板可用**：内嵌 UI 的复制/粘贴走传输桥（VS Code webview 会屏蔽 iframe 内的剪贴板；桥通过 `vscode.env.clipboard` 转发）。
- **主题跟随 VS Code**：内嵌 UI 跟随编辑器颜色主题（深/浅），切换即时生效（`deepseekHarness.themeSync`，默认 `follow`）。
- **跨平台**：macOS / Linux / Windows 三平台，由 CI 端到端验证（单测 + 真实 `dsh` 冒烟）。
- **界面语言：仅简体中文** —— 扩展刻意只做一种语言（维护 8 份额外翻译的成本远大于收益）。界面文案集中在 `src/i18nStrings.ts`，清单文案在 `package.nls.json`。
- **安全优先**：服务仅绑定回环；扩展以纯 Node 请求代发，不弱化 DSH 的 `/api` 信任围栏。（注：内嵌页面及其插件视为受信——剪贴板读写桥接到系统剪贴板，无浏览器授权弹窗，与扩展本身的信任等级一致。）

## 环境要求

- 已安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)——**0.1.2-rc.1 或更新**：`npm i -g @deepseek-ai/dsh`（更旧的 dsh 走 pre-0.1.2 API，启动时会被明确拒绝）
- **VS Code ≥ 1.105**（次级侧边栏形态要求 VS Code 的 `viewsContainers.secondarySidebar`，该贡献点自 1.100 起才被接受；本扩展的默认界面就依赖它。通过 Open VSX 亦可用于 Antigravity，但请确认其 VS Code 基线 ≥ 1.105）

## 版本兼容性

各扩展版本配套的兼容 dsh 版本——其余搭配会在启动时被明确拒绝：

| 扩展版本 | 兼容的 dsh 版本 |
|---|---|
| `0.4.0`（当前） | `0.1.2-rc.1`、`0.1.5-rc.1`、`0.1.5-rc.2` |
| `0.3.4` | `0.1.2-rc.1`、`0.1.5-rc.1`、`0.1.5-rc.2` |
| `0.3.3` | `0.1.1-rc.7` 及更早 |

- 表中为**实测通过**的搭配。dsh `0.1.2-rc.1` 起更换了 Web 表面（浏览器会话认证、Typert RPC、新 dist 布局），扩展 `≤ 0.3.3` 无法使用它；扩展 `0.3.4` 又要求 dsh `≥ 0.1.2-rc.1`。
- 对更新的 dsh 版本未设硬上限，但上游迭代极快——升级 dsh 后建议回归一次内嵌面板。
- **本项目的适配基线**记录在 [`docs/02-Areas/dsh-baseline.json`](docs/02-Areas/dsh-baseline.json)，可用 `npm run check:dsh` 随时核对是否已跟上上游最新版本。

## 安装

### 从本仓库构建的 VSIX 安装（当前推荐）

```sh
npm install --cache .npm-cache
npm run package        # 产物：dist/creatorliao.deepseek-harness-for-vscode-<版本>.vsix
```

然后在 **VS Code** 或 **Cursor** 中：扩展视图 → 右上角 `...` → **从 VSIX 安装...** → 选择 `dist/` 下的文件。

> 注意：本地 VSIX 未签名（编辑器会提示允许未知来源扩展），且**不自动更新**——新版本需重新构建并安装。

### 从 Open VSX 安装（Antigravity / VSCodium / Gitpod）

在 [Open VSX](https://open-vsx.org/) 搜索 *DeepSeek Harness for VS Code*，或在编辑器的扩展视图里搜索并安装。

### 关于 VS Code Marketplace

本扩展的 Marketplace 条目已于 2026-08-26 被微软**移除**（非下架），且官方明确**移除的扩展不予恢复**，原扩展名永久作废——所以现在只会出现在 Open VSX 上。经过与处置方案见
[事件记录](docs/01-Projects/R20260826-01-发布与分发/01-事件_Marketplace被移除.md)。

## 使用

1. 点击活动栏 **DeepSeek Harness** 图标 → dsh 自动启动（若未运行），侧边栏显示服务状态、版本与 URL。
2. 服务就绪后（`dsh web: http://127.0.0.1:<端口>`），DSH UI 在**编辑器标签页**打开。
3. 就绪后启动器提供 **Stop DeepSeek Harness** 与 **Open View**（全宽按钮）；点 **有新版本：x.y.z →**（随界面语言本地化）可升级 dsh。

想让 DSH 以你的项目为默认工作区，先在窗口里打开该文件夹（启动器底部会显示当前工作区）。

## 配置

| 设置项 | 默认 | 说明 |
|---|---|---|
| `deepseekHarness.themeSync` | `follow` | 将 VS Code 颜色主题同步到内嵌 DSH 界面；`off` 尊重 DSH 自身外观设置。 |
| `deepseekHarness.dshPath` | *（空）* | **可选**。`dsh` 可执行文件的完整路径。**留空即自动探测**（npm 全局 → `$DSH_BIN` → Homebrew → nvm → npx 缓存）——这是默认且通常够用的方式；仅在自动探测选错、或探测失败时才需要手工指定。 |
| `deepseekHarness.openTarget` | `editorTab` | DSH 界面默认开在哪里：`editorTab` = **右侧编辑器组**里的标签页（默认，一定看得见、宽度够输入）；`sidebar` = 次级侧边栏里的视图（很窄）。另一种形态随时可用命令面板打开（`在侧边栏打开` / `在编辑器标签页打开`）。 |

## 开发

```sh
npm install --cache .npm-cache
npm run compile     # tsc
npm test            # node:test 单元测试
npm run watch       # 增量编译（配合 F5）
npm run package     # 打包到 dist/（只保留最新一份 vsix）
npm run check:dsh   # 核对是否已跟上上游最新 dsh
```

在 VS Code 中按 `F5` 启动扩展开发宿主。

## 架构

扩展 spawn `dsh web --port 0`，将 DSH 前端作为同源 webview 资源加载，并通过 `postMessage` 桥把 `fetch` / WebSocket / 剪贴板转发到扩展宿主，由宿主以纯 Node 请求执行真实调用（通过 DSH 的 `/api` 信任围栏）。

## 项目知识库

全部设计决策、上游事实与工程规范都在 [`docs/`](docs/)（PARA 结构）：

| 我想知道… | 去哪 |
|---|---|
| 项目现在到哪一步、对应哪个 dsh | [路线图](docs/01-Projects/R20260914-01-演进总览/02-路线图.md) ｜ [演进时间线](docs/01-Projects/R20260914-01-演进总览/01-演进时间线.md) |
| 接下来做什么 | [待办总表](docs/01-Projects/R20260914-01-演进总览/03-待办总表.md) |
| 上游 dsh 发新版了该怎么跟 | [上游兼容规范](docs/02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md) |
| 为什么内嵌要这么写（桥架构） | [架构提案](docs/01-Projects/R20260817-01-桥架构与IDE内嵌/09-架构提案_by-deepseek.md) → [传输桥方案](docs/01-Projects/R20260817-01-桥架构与IDE内嵌/03-方案_传输桥架构.md) |
| 写代码要守什么规矩 | [工程规范](docs/02-Areas/20260914-01-工程规范.md) ｜ [扩展与 Webview 规范](docs/02-Areas/20260914-02-扩展与Webview规范.md) |
| DSH 的协议与围栏事实 | [DSH 上游事实与协议速查](docs/03-Resources/20260914-01-DSH上游事实与协议速查.md) |

智能体工作规则见 [AGENTS.md](AGENTS.md)。

## 变更日志

见 [CHANGELOG.md](CHANGELOG.md)（中文）／ [CHANGELOG.en.md](CHANGELOG.en.md)（English）。

## License

MIT — 见 [LICENSE](LICENSE)。Copyright © 2026 liaohai1。
