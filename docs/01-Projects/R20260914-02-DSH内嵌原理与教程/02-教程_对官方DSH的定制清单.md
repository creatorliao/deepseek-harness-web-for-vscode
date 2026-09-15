# 教程 · 对官方 DSH 的定制清单

**日期**: 2026-09-14 ｜ **状态**: 当前 ｜ **回答**: Q2「它在官方 DeepSeek Harness 基础上做了哪些定制？」
**事实基准**: 代码 commit `7918816` 之后的工作区；"官方原样"一侧以 dsh `0.1.2-rc.1` ~ `0.1.5-rc.2` 为准

> 说明：你原问题里写的是"官方的 **Excel**"，本仓库与 Excel 无关，此处按**官方 DeepSeek Harness** 解读。

---

## 0. 总原则：零 fork

**我们一行 DSH 源码都没改，也永远不会改。** 所有定制都发生在这两个位置：

```
① 文档层 —— DSH 的 HTML 在被送进 webview 之前，被我们改写与注入
             （src/documentAssembly.ts）
② 宿主层 —— DSH 进程之外，扩展自己做的事
             （serverManager / bridgeHost / themeSync / dshPanel / launcherView）
```

这样做的直接好处：**上游升级时我们不需要合并任何 patch**，只需要核对"我们依赖的官方形态有没有变"（见 [上游兼容规范](../../02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md) 的四个破坏面）。

---

## 1. 定制点总表

### A. 文档层（改写 / 注入 DSH 的 HTML）

| # | 官方原样 | 我们改成什么 | 代码位置 |
|---|---|---|---|
| A1 | `<script src="/assets/index-*.js">`（0.1.2 前）或 `<base href="/">` + `<script src="./assets/index-*.js">`（0.1.2 起） | 全部改为**本地同源 webview URI**（`webview.asWebviewUri(distRoot/assets/…)`） | `documentAssembly.ts:213-217`（正则 `:50`） |
| A2 | `<link href="/manifest.webmanifest">`、`favicon.svg` | 指回 `serverBase`（这两个不值得本地化） | `documentAssembly.ts:218`（正则 `:58`） |
| A3 | boot 清单 `entries[].url` = `/plugins/…`（相对服务器根） | 前缀加上 `serverBase`，变成绝对 URL | `rewriteBootPluginUrls:115-132` |
| A4 | boot 清单 `batches[].url` = `/plugins/??…`（0.1.2 新增） | 同上，绝对化 | `rewriteBootPluginUrls:127-129` |
| A5 | `<script src="/plugins/…">` 阻塞式 preload（rc.8 新增） | 同上，绝对化。**不改写会直接导致 "Failed to load plugins"** | `rewriteBootPluginPreloads:142-144`（正则 `:66`） |
| A6 | 无 CSP（浏览器直开不需要） | 注入严格 CSP：`default-src 'none'`、`connect-src 'none'`、`frame-src 'none'`、`worker-src 'none'`；`img-src` 里额外放行 **`blob:`**（上游图片预览全用 `URL.createObjectURL`，不放行就是破图） | `buildCsp:154-165`，注入在 `:236-238`；缘由见 [修复记录 14](../R20260817-01-桥架构与IDE内嵌/14-修复_面板内图片不显示与内测声明反复出现.md) |
| A7 | 无桥 | 在 `<head>` 注入 `window.__DSH_BRIDGE__ = { serverBase, dark }` | `documentAssembly.ts:223` |
| A8 | 前端自选"最近活跃"的会话 | 注入脚本写 `localStorage["dsh.sessions.current"] = {"sessionId":…}`，**在 DSH 模块脚本之前**执行 | `documentAssembly.ts:224-226`；载荷由 `workspaceTracker.buildSessionPresetPayload` 生成 |
| A9 | 无桥客户端 | 注入 `media/bridge-client.js`（shim fetch / WebSocket / clipboard / matchMedia） | `documentAssembly.ts:227`；脚本本体在 `media/bridge-client.js` |
| A10 | 无状态覆盖层 | 在 `</body>` 前注入覆盖层（starting / error / stopped 三态） | `documentAssembly.ts:231`；HTML 在 `dshPanel.statusChromeHtml()` |
| A11 | CSS 内 `url("./fonts/…)`（0.1.2 起）/ `url("/assets/…")`（更早） | 下载时把每个 `url()` 改写成本地 webview URI，并把目标（字体/图片）一并加入下载队列 | `downloadTree:277-284`（正则 `:51`） |
| A12 | 整棵 `/assets` 树由服务器提供 | **下载到本地缓存** `globalStorage/dsh-dist`，缓存键 = boot manifest 的 `rev`；`rev` 变了才重下 | `assembleDocument:182-206`、`extractRev:105-108` |
| A13 | 页面 origin 是 `vscode-webview://…`（非回环）→ 上游把 settings scope 判为 **memory 模式**：设置不落盘、「内测声明」每次重载都再弹 | 声明传输载体钩子：`window.__DSH_TRANSPORT__ = { fetch: <桥的 fetch shim>, ownsHost: true }` → `isLoopback=true` → settings 走 host 模式真正落盘 | `media/bridge-client.js` 的 `DSH transport-hook declaration` 段（该文件即 A9 注入的桥脚本，整体先于 DSH 模块脚本执行）；缘由见 [修复记录 14](../R20260817-01-桥架构与IDE内嵌/14-修复_面板内图片不显示与内测声明反复出现.md) |

> **为什么必须这么做**：webview 里跨源 module/font 加载要 CORS，而 DSH 服务器不发这些头；不本地化就会白屏或字体丢失。见 [01-教程](01-教程_工作原理与传输桥架构.md) §2 约束三。

### B. 宿主层（DSH 进程之外）

| # | 官方原样 | 我们做了什么 | 代码位置 |
|---|---|---|---|
| B1 | 用户自己敲 `dsh web` | 扩展托管子进程：`dsh web --port 0`（OS 分配端口），解析 stdout 启动行拿端口 | `serverManager.ts:463,474-480` |
| B2 | `dsh web` 从 rc.8 起**自动打开默认浏览器** | 追加 `--no-open` 抑制；**用现场探测 `dsh web --help` 决定**，探测失败才退回版本号判断 | `serverManager.ts:469-471`、`probeNoOpenSupport:270` |
| B3 | 任何版本的 dsh 都能跑 | 设**硬版本下限** `0.1.2-rc.1`，更旧的直接拒绝启动并给出升级命令 | `serverManager.ts:77,445-451` |
| B4 | 浏览器直接访问即换得会话 Cookie | 扩展在**标记就绪之前**用启动行里的 `?token=` 换 Cookie（`node:http` GET，读 `Set-Cookie`） | `onReadyLine:538-546`、`exchangeCookie:565-604` |
| B5 | —— | 此后**每一次**代发都带上这个 Cookie：HTTP 代发、WebSocket 升级、RPC、文档抓取 | `bridgeCore.ts:39,72`、`serverManager.ts:645`、`documentAssembly.ts:179-180` |
| B6 | 前端自己说 Typert 协议 | 宿主侧 RPC 客户端按 0.1.2 信封发：`{type:"client-request", rpcId, method, payload:{args}}` | `serverManager.api:638-663` |
| B7 | 工作区枚举走 `workspace/list`（0.1.2 已 404） | 改走 `workspace/follow` 流的**首帧基线** | `workspaceSnapshot:671-678` |
| B8 | 前端自己决定初始工作区 | 扩展**主动保证** IDE 当前文件夹在 DSH 里是一个工作区且至少有一个会话，再配合 A8 预设 | `ensureWorkspaceSession:697-715` |
| B9 | 主题由用户在 DSH 设置里选 | 扩展把 VS Code 主题写进 DSH：`POST /api/settings.update`，命名空间 `ui-theme`，`patch:{preference}` | `themeSync.ts:22-31` |
| B10 | 浏览器剪贴板 API | 页面侧 shim → `postMessage` → 宿主 `vscode.env.clipboard`（绕开 [约束一](01-教程_工作原理与传输桥架构.md)） | `bridgeHost.ts:61-76` |
| B11 | 无 IDE 外壳 | 编辑器标签页面板（图标、会话标题、覆盖层）、**左侧启动器侧边栏**、状态栏按钮、4 条命令 | `dshPanel.ts`、`launcherView.ts`、`statusBar.ts`、`commands.ts` |
| B12 | 无版本提示 | 24h 门控的 dsh 版本软校验 + 按安装方式推荐升级命令（预填终端，从不自动执行） | `versionCheckService.ts`、`versionCheck.ts` |

### C. 我们往 DSH 里"写"的数据（副作用，要心里有数）

这些不是"改 UI"，是**真的写进了 DSH 的状态**：

| 写入 | 内容 | 位置 |
|---|---|---|
| `localStorage["dsh.sessions.current"]` | `{"sessionId":"…"}` | 每次面板组装时（覆盖前值） |
| DSH 设置 `ui-theme` | `{preference: "dark"\|"light"}` | 每次状态转 ready + 每次主题切换 |
| DSH workspace | IDE 打开过的文件夹会被创建为 workspace | `workspace/create`（仅当不存在时） |
| DSH session | 每个 workspace 至少一个会话（复用已有的，不重复建） | `session/create` |
| 会话归档 | `workspace/archiveSession`（append-only，不删除） | 侧边栏 `✕` 操作 |

> ⚠️ 所以扩展"共享 `~/.dsh`"这件事有真实后果：你在扩展里做的事，浏览器端也看得到，反之亦然。这既是特性（同一份会话），也是你需要知道的边界。

---

## 2. 明确"没有做"的事（边界）

这些是**刻意不做**的，写在这里是为了以后不要走回头路：

| 不做 | 原因 |
|---|---|
| fork / patch DSH 源码 | 上游一个月数次破坏性变更，维护 fork 必然跟不上；见 [产品定位与边界](../../02-Areas/20260914-09-产品定位与边界.md) §8 |
| 把 DSH 的 UI 重写成 VS Code 原生控件 | DSH 的 UI 是官方产品；重写 = 永远落后的仿制品，且失去官方更新 |
| 往 DSH 的 DOM 里塞我们的组件 | DSH 前端结构随上游变，DOM 注入是最脆弱的一类改动（Q4 的方案会具体讨论这个红线） |
| 弱化 / 绕过 `/api` 信任围栏 | 安全基线，见 [工程规范](../../02-Areas/20260914-01-工程规范.md) §5 |
| `dsh web --host 0.0.0.0` | 只允许回环监听 |
| 改 DSH 的 RPC 语义或伪造响应 | 桥是"透明转发"，不是"mock" |

---

## 3. 一张图看清"定制 vs 原样"

```
            ┌──────────── DSH 官方仓库（我们从不碰）────────────┐
            │  dsh CLI · web app · client-runtime · 前端 dist    │
            └───────────────────────┬───────────────────────────┘
                                    │  npm 安装，原样运行
   ┌────────────────────────────────┼────────────────────────────────┐
   │                                ▼                                │
   │  宿主层定制（B1–B12）        dsh web 进程                        │
   │  · 谁来启动它                                                   │
   │  · 传什么参数                                                   │
   │  · 怎么认证                                                     │
   │  · 怎么调它的 API（RPC / 流）                                    │
   │                                │                                │
   │                                ▼  GET /  +  /assets/**          │
   │  文档层定制（A1–A12）      DSH 的 HTML 与资产                    │
   │  · 改写引用 → 同源                                              │
   │  · 注入 CSP / 桥 / 预设 / 覆盖层                                 │
   │                                │                                │
   │                                ▼                                │
   │              编辑器标签页里的 webview（DSH 前端原样渲染）          │
   └─────────────────────────────────────────────────────────────────┘
```

**一句话记住**：我们把 DSH 当成一个**黑盒网页应用**——不读它的源码逻辑，只控制它的**启动方式**、**页面送达方式**和**网络出口**。

---

*关联文档：[01-教程_工作原理与传输桥架构.md](01-教程_工作原理与传输桥架构.md) ｜ [03-教程_启动流程全链路.md](03-教程_启动流程全链路.md) ｜ [04-方案_DSH界面调整与侧边栏收纳.md](04-方案_DSH界面调整与侧边栏收纳.md) ｜ [../../02-Areas/20260914-01-工程规范.md](../../02-Areas/20260914-01-工程规范.md)*
