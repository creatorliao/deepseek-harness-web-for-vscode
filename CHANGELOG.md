# 更新日志

**中文** | [English](CHANGELOG.en.md)

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/spec/v2.0.0.html)。

## [0.5.0] - 2026-09-17

### 新增

- **从资源管理器把文件拖进 DSH 输入框，自动变成 `@` 引用**（对标 Cursor 的"拖文件进 Chat"）：
  拖入单个文件、多选的一组文件或文件夹，会在输入框里写入 `@工作区相对路径`（含空格的路径写成 `@"…"`，目录带尾随 `/`）——与用 `@` 补全选中该文件**功能等价**。
  - ⚠️ **必须按住 `Shift` 再拖**。这不是本扩展的选择，而是 VS Code 的硬约束：窗口内拖拽期间它会把每个 webview iframe 的指针事件关掉（源码注释原文是 "Webview break drag and dropping around the main window"），只有按住 `Shift` 才放行——这正是微软对 issue #182449「Drop files from Explorer to CustomEditor (webview) doesn't work」给出的官方解法（PR #209211，1.93+）。不按 `Shift` 时文件会被 VS Code 在编辑器区打开，看起来像"功能没生效"。
  - **等价的右键入口（不需要 Shift）**：资源管理器里选中文件 → 右键 → **添加到 DSH 输入框（@ 引用）**。多选与文件夹同样支持。加这一项是因为上面的拖拽路径还可能被 VS Code 自身的缺陷挡掉（microsoft/vscode#237958 至今 open）。
  - 写入的是**纯文本 `@路径`**：上游 `@` 补全产生的 chip，其 `serialize()` 就是这串文本，所以发给模型的消息逐字节相同——视觉上没有 chip，语义一致。这是有意取舍：上游没有开放程序化插入 chip 的入口，而单独复刻 chip 不带来任何功能收益。
  - 只接管"资源类"拖拽：从 **Windows 资源管理器拖真实文件**（仍走 DSH 自带的附件上传）与**从编辑器拖选中的文本**都不受影响，行为与升级前完全一致。
  - 写入失败（输入框正忙 / 不可编辑）时**不谎报成功**：引用会复制到剪贴板并弹出中文提示，请按 `Ctrl+V` 粘贴。
  - 引用路径以工作区根（DSH 子进程的 cwd）为基准；工作区外的文件保留绝对路径。
- 新增命令 **`添加到 DSH 输入框（@ 引用）`**（资源管理器右键菜单）。

### 说明（实现边界，按事实记录）

- 需要 dsh `0.1.2-rc.1` 以上（未变）；本次不涉及上游四个破坏面，兼容矩阵不变。
- 「拖到 composer 即可用」这一跳的**真机鼠标验收需用户完成**（本机无法自动化 GUI 拖拽）：一分钟验收步骤见
  [`docs/01-Projects/R20260917-01-目录树拖拽到Composer/08-验证_目录树拖拽到Composer.md`](docs/01-Projects/R20260917-01-目录树拖拽到Composer/08-验证_目录树拖拽到Composer.md)。

## [0.4.0] - 2026-09-15

### 修复

- **修复启动失败 `dsh did not become ready within 10000ms`**（Windows 上尤其容易触发，一旦触发 DSH 完全不可用）：
  - **就绪超时由 10 秒上调到 60 秒**。实测 `dsh web --port 0` 打印启动行需要 **4.3–9.3 秒**（`0.1.2-rc.1` 约 4.3 s；**`0.1.5-rc.1` 约 7.4–9.3 s**），原 10 秒预算给 0.1.5 只剩不到 3 秒余量，冷启动、杀软扫描或新工作区首次初始化叠加就会误报超时。
  - **修复「Windows 上 npm 全局安装的 dsh 永远探测不到」**：`npm prefix -g` 经 `spawnSync` 调用时缺 `shell`，而 Windows 的 `npm` 是 `npm.cmd`，执行失败被静默吞掉 → 最常见的安装方式被整体跳过、退化为裸 PATH 查找。修复后自动探测能正确命中 npm 全局安装。
  - `--no-open` 能力探测超时由 5 秒上调到 20 秒（`dsh web --help` 实测 4.3–5.3 秒，原预算踩线会偶发探测失败）。
  - 修复含空格的二进制路径在 `shell: true` 下被 cmd.exe 拆断的问题。
  - `$DSH_BIN` 未设置时不再产生畸形的裸 `.cmd` 探测候选。
  - **超时错误现在会引用子进程的真实输出**（`bin=` / `version=` / `stdout=` / `stderr=`），不再是一个无法判断原因的信息；手工配置的二进制不存在时，错误会点名该路径并提示设置项。
- **启动失败只报 `dsh exited before ready (code=1, signal=null)`，看不到任何原因**：子进程**退出**这条分支把 stderr 整个丢了，而同文件的**超时**分支早就带着 `stdout=` / `stderr=` —— 于是同一次故障，走超时能看到原因、走退出看不到。现在两条退出文案都会带上 stderr 里的**第一条 error 行**（`first error: …`）与 stderr 尾部。
  - 为什么不能只贴尾部：真实故障的 stderr 是很长的 AggregateError，而尾部只截 600 字节，**那 600 字节全是右括号**。
  - 触发这次修复的真实故障：全局 dsh 被 npm **半装**（koffi 的 JS 包装是 `3.3.0`、原生二进制还是 `3.2.1`）→ 每次 `dsh web` 启动即 `Mismatched native Koffi modules` 退码 1。完整证据链见 `docs/01-Projects/R20260820-01-上游DSH版本适配/12-修复_全局dsh半装koffi错配导致启动即退码1.md`。
  - ⚠️ 这条只修**可诊断性**：`Mismatched native Koffi modules` 是**本机 npm 全局安装坏了**，不是扩展的问题，修复办法是停掉占用原生模块的残留 dsh 进程后重装（`docs/02-Areas/20260915-01-内核升级最佳实践.md` §4.1 有自检命令）。
- **面板里粘贴的截图不显示**（缩略图与消息内图片都是破图，只看到 `alt` 文本 `image.png`）：注入的 CSP `img-src` 没有放行 `blob:`，而 DSH 前端的图片预览**全部**用 `URL.createObjectURL` 产生的 Blob URL，webview 因此直接拒载。现已放行 `blob:`（`src/documentAssembly.ts` 的 `buildCsp()`），并在同处加注释把这一个条目（以及 `script-src` 里的 `http://127.0.0.1:*`）标为"看着宽、其实承重"，防止后来者当冗余删掉。破的只是**显示**——图片发送本来就走 base64 内联，所以才会"发得出去、只是看不见"。
- **「内测声明」每次打开面板都弹，面板里的设置也不落盘**：嵌入页面的 origin 是 `vscode-webview://…`，DSH 客户端据此判定 `isLoopback=false`，把 settings scope 落在 **memory 模式**——确认只写进该文档内的变量，面板下一次组装即归零（所以按钮照常关闭，看起来"点了有用"）；同一根因还让面板里的设置写入（含 Models 页保存）永不落盘。现按上游契约注入 `window.__DSH_TRANSPORT__ = { fetch, ownsHost: true }`（`media/bridge-client.js`），`isLoopback` 转为 true、持久化模式回到 `host`。
  ⚠️ **行为变更（须声明）**：面板里改的设置从此**真的写进 `~/.dsh/settings.yaml`**，浏览器端会看到同一份——与本项目"扩展与浏览器共用 `~/.dsh`"的既有边界一致，但这确实是一处行为变化。

### 新增

- **启动器侧边栏新增「打开对话界面」按钮**（服务器就绪时显示，主按钮、全宽）——这是进入 DSH 界面的**显式入口**。此前该面板只报状态、只列会话，没有任何"打开页面"的入口，用户会卡在"启动成功了但我不知道去哪儿输入"。（该按钮在 v0.2.0 曾被当作"冗余"删掉，本次加回。）
- **`npm run diagnose:dsh`**：一键打印环境、npm 全局前缀、自动探测结果与 `tried` 列表，并实测 `dsh web` 的启动耗时 —— 下次"起不来"不用再猜。
- **新设置 `deepseekHarness.dshPath`**（默认**空 = 自动探测**）：仅在自动探测选错了 dsh、或探测失败时才需要手工指定完整路径；正常情况下**不需要配置任何东西**。
- **DSH 界面默认开在右侧编辑器组**（像 Cursor 那样贴在右边）——`DeepSeek Harness: 在编辑器标签页打开` 或任何启动路径都会把完整 DSH Web UI（含底部 **Composer 输入框**）停靠在**最右侧的编辑器组**里；只有单个编辑器组时会自动在右侧新建一个，多个组时复用已有的最右组（不会每开一次就多分一栏）。
- **次级侧边栏形态仍然提供，但改为可选**：新增 `contributes.viewsContainers.secondarySidebar` 容器与 webview 视图 `deepseek-harness.chatView`，把设置 `deepseekHarness.openTarget` 设为 `sidebar` 即可把界面钉在右侧次级侧边栏。
  ⚠️ 它很窄（DSH 是三栏应用，在约 300px 的侧栏里会话列会被压到几百像素），且若次级侧边栏未显示会让你看不到输入框——**这正是默认值后来改回 `editorTab` 的原因**。
- **新设置 `deepseekHarness.openTarget`**（默认 `editorTab`）：决定"启动/打开"默认走右侧编辑器组还是次级侧边栏。两种形态都随时可从命令面板打开。
- 新命令 `在侧边栏打开` / `在编辑器标签页打开`。
- **`dist/` 构建产物约定**：`npm run package` 现在把扩展打包到 `dist/`，该目录**永远只保留最新一份**
  vsix，文件名带版本号（`creatorliao.deepseek-harness-for-vscode-<版本>.vsix`），便于直接导入
  VS Code / Cursor。
- **上游跟随机制**：新增 `npm run check:dsh`（对比适配基线与 npm 上最新发布的 dsh）、
  机器可读基线 `docs/02-Areas/dsh-baseline.json`、以及每周定时巡检 workflow
  `.github/workflows/upstream-watch.yml`。规范见 `docs/02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md`。

### 变更（项目与文档）

- **项目归属与标识变更**：项目改由 `liaohai1` 维护，作者署名与版权归 `liaohai1`；扩展 id 由
  `floatinghotpot.deepseek-harness-web-for-vscode` 改为 **`creatorliao.deepseek-harness-for-vscode`**，
  显示名改为 **DeepSeek Harness for VS Code**，仓库地址改为 `creatorliao/deepseek-harness-for-vscode`。
  ⚠️ 这是一次 **id 变更**：在编辑器看来是一个不同的扩展，旧版本的安装与设置不会自动迁移。
- **文档体系重构为 PARA**：原 `doc/` 改为 `docs/`，按 `01-Projects`（演进历史，按主题夹）／
  `02-Areas`（项目规范）／`03-Resources`（外部参考）／`04-Archives`（弃用归档）四维组织。
  工作规则集中到 `AGENTS.md`（唯一规则源），历史 `CLAUDE.md` 改为指向它的薄壳。
- **README / CHANGELOG 主档改为中文**，英文版保留为 `README.en.md` / `CHANGELOG.en.md`。

### 变更（破坏性）

- **界面语言只保留简体中文**：删除 `ja / ko / ru / es / pt / fr / de` 七种翻译，并删除 `package.nls.zh-cn.json`（`package.nls.json` 的内容改为中文，因此任何系统语言下界面都是中文，不会回落到英文）。`src/i18nStrings.ts` 每行只剩 `zh` 一项，表体积从 506 行降到 151 行。
- **`engines.vscode` 由 `^1.90.0` 抬到 `^1.105.0`** —— 次级侧边栏贡献点（`viewsContainers.secondarySidebar`）需要 VS Code ≥ 1.100；取 `1.105` 是因为它同时覆盖本机 VS Code **1.105.1**（F5 用）与 **Cursor 1.128.0**。
  （曾一度设为 `^1.137.0`，结果 Cursor 直接拒绝安装：`not compatible with VS Code '1.128.0'` —— `engines` 是**下限**不是设计目标，抬高只会把人挡在门外。）
  同时把 `devDependencies["@types/vscode"]` **锁死**为 `1.105.0`（此前是 `^1.90.0`，实际会解析到最新类型，导致编译期类型新于引擎下限）。
  ⚠️ **1.90–1.104 的编辑器不再支持**；Antigravity 用户请确认其 VS Code 基线 ≥ 1.105。
- `deepseekHarness.openTarget` 默认值是 `editorTab`，因此**升级后启动 DSH 会把界面开在右侧编辑器组里**。想把它钉在次级侧边栏请设为 `sidebar`。

### 内部

- `extension.ts` 新增唯一路由点 `openUi()`：所有"打开 DSH 界面"的路径（启动、状态栏、侧边栏点会话、新建会话、reload 恢复）统一走它，避免设置在一部分路径上生效、另一部分被忽略。
- 覆盖层 HTML、主题探测与 dist 缓存路径从 `dshPanel.ts` 外提到新的 `src/dshUi.ts`，供编辑器标签页与侧边栏视图共用。
- 新增 `src/openTarget.ts`（纯函数 + 容器 id 常量）与 `test/openTarget.test.js`（5 条：默认值、`editorTab`、非法值回落、容器 id 与 `package.json` 交叉校验、`engines` 版本校验）。

## [0.3.4] - 2026-09-07

### 修复
- **适配 dsh 0.1.2-rc.1** —— dsh 升级过 0.1.1-rc.7 后内嵌面板无法启动：0.1.2-rc.1 启动行改为带令牌的认证 URL（`dsh web: http://127.0.0.1:<port>/?token=…`），`/` 与全部 `/api` 要求由该令牌换发的浏览器会话 Cookie，RPC 改走 Typert `namespace/method` 端点（工作区列表改为 `workspace/follow` 流基线），前端 dist 改相对引用资源（`./assets/...`）并新增 `batches` boot 段。扩展现在**在服务就绪前**完成令牌换 Cookie，并注入到所有代发请求 / WebSocket 升级 / 面板组装；宿主 RPC 全面迁移到 0.1.2 表面（会话列表/新建/改名/归档、工作区对齐）；文档组装适配 0.1.2 dist 布局。
- **旧版 dsh 给清晰报错而非半残状态** —— 扩展现在要求 dsh **0.1.2-rc.1 或更新**；更旧的版本在启动时被拒绝并给出升级提示（旧版走 pre-0.1.2 API，已不再支持）。
- **"Open in Browser" 打开的是死链** —— 命令改为打开带令牌的认证 URL（`?token=…`），让真实浏览器自行换发 Cookie，不再落到 401 页。

## [0.3.3] - 2026-08-22

### 修复
- **侧边栏状态卡在 "Starting…"** —— 切换侧边栏（如文件树 ↔ DeepSeek Harness）或笔记本睡眠唤醒后，侧边栏状态可能一直显示闪烁的 "Starting…"，即使服务已就绪、会话列表正常刷新。原因是状态消息在侧边栏页面加载完成前发送而被丢弃。现改为页面加载完成后主动通知扩展，扩展再补推当前状态。

## [0.3.2] - 2026-08-20

### 修复
- **dsh 0.1.1-rc.2 下面板报 "Failed to load plugins"** —— dsh 升级到 0.1.1-rc.2 后内嵌面板再次失效：boot 注入从 `window.__DSH_BOOT__` 改为 `globalThis["__DSH_BOOT__"]`，插件 bundle URL 不再被改写为服务器地址，webview 无法加载（"bundle script /plugins/... failed to load"）。现已兼容两种注入形态。

## [0.3.1] - 2026-08-20

### 修复
- **面板不再报 "Failed to load plugins"** —— 使用较新 dsh（rc.8+）时，内嵌面板可能显示 *"Failed to load plugins / HTML did not preload @deepseek-ai/dsh-client-modules/client.js"*。现已修复，插件可正常加载。
- **不再自动弹出浏览器** —— 启动扩展时可能自动打开默认浏览器访问 DeepSeek Harness UI。现已抑制，UI 保持内嵌在 VS Code 中。（如确实想在浏览器中使用，可执行 "Open in Browser" 命令。）
- **预览版升级提示恢复正常** —— 当 dsh 有更新的预览版（如 rc.8）可用时，侧边栏会按预期显示升级提示，不再被静默隐藏。
- **关闭 VS Code 不再报错** —— 关闭或重载窗口时，控制台可能出现的 "DisposableStore" 报错已消除。

### 新增
- **侧边栏显示扩展版本号** —— 启动器头部在 DeepSeek Harness 标题下方显示 `extension v0.3.1`，随时可确认当前扩展版本。

## [0.3.0] - 2026-08-20

### 新增
- **双渠道升级提示** —— 侧边栏同时跟踪 npm 两个渠道：**latest** 与 **next**（预览版）按钮在对应渠道存在更新时独立出现（如 `最新版更新：0.1.0-rc.7` + `预览版更新（next）：0.1.0-rc.8`）；点击后 QuickPick 按渠道给出 `@latest` / `@next` 命令（预填终端，绝不自动执行）。
- **`--no-open` 浏览器抑制** —— dsh 0.1.0-rc.8 起 `dsh web` 默认打开默认浏览器；扩展现在按版本门控追加 `--no-open`（不认该 flag 的旧版本不受影响），保持嵌入式 UI 不弹浏览器。

### 修复
- dsh **已在运行时**再打开侧边栏，会话列表一直为空（轮询只在状态变化时启动）。现在打开侧边栏即立即轮询。

## [0.2.0] - 2026-08-19

### 新增
- **会话管理器侧边栏** —— 列出全部活跃会话（标题 + 相对活跃时间 `5m`/`3h`/`2d` + `✎` 重命名 + `✕` 归档）；**可展开的归档区**显示归档会话（含标题）；空白会话显示为 "New Session" 行；每 5s 刷新（服务状态感知、防重入）。
- **多面板绑定多会话** —— `＋新建会话` 打开绑定新会话的新面板；点列表项打开/聚焦对应面板；面板**堆叠在当前标签组**（不再平铺挤窄视图）。
- **归档自动关面板** —— 归档会话时同时关闭其打开的面板；默认面板绑定 IDE 工作区会话，归档时同样可关闭。
- **重载恢复全部面板** —— dist 树缓存下载做了并发保护，同时恢复多个面板不会再出现空面板。
- 新功能 UI 文案覆盖全部 9 种语言。

### 修复
- 空白会话不再每次启动累积——复用已有会话。
- macOS realpath 不匹配（`/var/folders` ↔ `/private/var/folders`）不再破坏工作区匹配。

### 变更
- 移除侧边栏启动器中冗余的 "Open View" 按钮（命令与状态栏入口保留）。

## [0.1.0] - 2026-08-18

### 新增
- **工作区对齐** —— DSH workspace 锚点现在跟随 IDE 工作区（feature M1）：
  - 切换文件夹会关闭过期面板并冷启动；重载*同一*工作区会自动重启 dsh 并恢复面板。
  - 嵌入式 UI 显示**当前 IDE 工作区**（而非最近活跃的一个），通过在 DSH 前端启动前注入的会话预置实现。
  - 点击活动栏图标会在 dsh 未运行时自动启动。
- **dsh 版本软校验 + 升级辅助** —— 检测到更新的 dsh 时，侧边栏显示 "Update available: x.y.z →"；点击后按安装方式（npx 缓存 / npm 全局 / nvm）给出匹配的升级命令，在 QuickPick 中选择后预填到集成终端（绝不自动运行）。检查每 24 小时限一次，且离线安全。
- **侧边栏精炼** —— 全宽按钮（Stop 在 Open View 上方）、两行状态（版本 + URL）、移除副标题。
- 新功能的 UI 文案覆盖全部 9 种语言。

## [0.0.10] - 2026-08-17

### 新增
- 扩展 UI 翻译：日语、韩语、俄语、西班牙语、葡萄牙语、法语、德语（共 9 种语言；跟随 VS Code 显示语言）。

## [0.0.9] - 2026-08-17

### 修复
- 跨平台 dsh 进程终止：在 Windows 上终止完整进程树（`taskkill /T /F`），使 `cmd.exe` 包装层不再遗留孤立的 `node` 子进程。
- 单测可移植性：平台无关的路径断言和 Windows 兼容的假 `dsh` shim。

### 变更
- CI 冒烟测试步骤现在有 15 分钟超时。

## [0.0.8] - 2026-08-17

### 新增
- 跨平台 CI 矩阵（macOS、Ubuntu、Windows），含真实 `dsh` spawn 冒烟测试。
- README 徽章（CI、Open VSX 版本/下载量、Marketplace 链接）。

### 修复
- Windows 二进制解析（`dsh.cmd`、`%LocalAppData%\npm-cache` 布局）与 `shell: true` spawn。

## [0.0.7] - 2026-08-17

### 变更
- `repository` 指向改名后的 GitHub 仓库。

## [0.0.6] - 2026-08-17

### 变更
- 展示名改为 "DeepSeek Harness Web for VS Code"（VS Code Marketplace 展示名全局唯一）。

## [0.0.5] - 2026-08-17

### 变更
- 扩展 ID 改为 `deepseek-harness-web-for-vscode`（VS Code Marketplace 扩展名全局唯一）。

## [0.0.4] - 2026-08-17

### 新增
- 编辑器标签页 webview 上的 DeepSeek 标签图标。

## [0.0.3] - 2026-08-17

### 新增
- 中央双语（en/zh）字符串表；UI 跟随 VS Code 语言。
- 纯英文的 Marketplace 描述。

## [0.0.2] - 2026-08-17

### 修复
- 将运行时 `ws` 依赖打包进 vsix（没有它时新安装激活即崩溃）。

## [0.0.1] - 2026-08-17

### 新增
- 初始 MVP：spawn `dsh web`、传输桥（fetch/WebSocket/剪贴板）、编辑器标签页 webview、侧边栏启动器、状态栏、主题跟随和打包。
