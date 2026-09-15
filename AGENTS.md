<!-- BEGIN:para-structure-agents -->

## docs / PARA 落盘约定

`docs/`（或当前 PARA 根）下只有四维：`01-Projects`、`02-Areas`、`03-Resources`、`04-Archives`。

**按维分流，不要混用。** 创建或补全 PARA 目录时同步维护本锚点块，是推荐做法。

| 维 | 放什么 | 是否建主题子文件夹 |
|----|--------|-------------------|
| `01-Projects` | 每次输入的**需求、方案**及同主题配套稿（任务、调查、改善报告等） | **要**：一个主题一个项目夹 |
| `02-Areas` | 长期维护的规范、领域笔记、调查备忘（无明确交付闭环） | **不要**：文件直接落在该维根下 |
| `03-Resources` | 外部参考、剪藏 | **不要** |
| `04-Archives` | 已结束项目整体迁入 | **不要**为新主题 mkdir；迁入时保持原项目夹 |

### `01-Projects`：需求 / 方案按主题夹

落到 `01-Projects/<项目夹>/`，不要散落到另外三维。

```text
R{YYYYMMDD}-xx-主题
```

- `{YYYYMMDD}`：创建日；`xx` 为当日已有同前缀夹的下一号（从 `01` 起）
- 夹内用 `00-README.md`、`01-需求_….md`、`02-方案_….md` 等编号文件，不要再套一层主题子目录
- 已有同主题夹则追加文件，不要平行再开一夹
- 新建夹优先：`para-structure cp "主题"`

### 另外三维：禁止再嵌套主题子文件夹

`02-Areas`、`03-Resources`、`04-Archives` 的根下直接放 `YYYYMMDD-xx-主题.md`（序号按该维根下当天已有同前缀文件计）。

| 不要 | 要 |
|------|----|
| `02-Areas/主题/需求.md` 或 `02-Areas/YYYYMMDD-xx-主题-需求.md` | `01-Projects/R…-主题/01-需求_….md` |
| 在 Resources / Archives 根下为新主题 mkdir | 单文件落在该维根下（归档迁入的整夹除外） |

`.gitkeep` 与 PARA 根 `README.md` 是脚手架，不要删。

<!-- END:para-structure-agents -->

---

# AGENTS.md —— 本项目的工作规则

> 本文件是**唯一规则源**。`CLAUDE.md` 只是指向本文件的薄壳。
> 上面的 `para-structure-agents` 锚点块由 PARA 工具维护，不要手改；下面的人写规则由项目维护者维护。
> **细则不在本文件**：本文件只写"每次都该加载的硬规则"，具体标准放在 `docs/02-Areas/`，用链接引用，**不复制正文**（避免两处维护漂移）。

## 项目速览

| 项 | 值 |
|---|---|
| 产品 | **DeepSeek Harness for VS Code** —— VS Code 扩展：一键启动 DeepSeek Harness（DSH）并把其 Web UI 内嵌进 IDE；同时兼容 Antigravity（VS Code fork，走 Open VSX） |
| 技术栈 | Node.js ≥ 20 + TypeScript（`tsc` strict）；npm；vsce 打包；`node:test` 单测 |
| 标识 | 扩展 id `creatorliao.deepseek-harness-for-vscode`；作者 `liaohai1`；仓库 `creatorliao/deepseek-harness-for-vscode` |
| 渠道 | 仅 **Open VSX** 在售（VS Code Marketplace 已于 2026-08-26 被移除，见 `docs/01-Projects/R20260826-01-发布与分发/`） |
| 上游 | `@deepseek-ai/dsh`，迭代极快；**适配基线见 `docs/02-Areas/dsh-baseline.json`** |
| 知识库 | `docs/`（PARA 四维），导航见 `docs/README.md` |

## 0. 思考纪律（最先读）

> "The models make wrong assumptions on your behalf and just run along with them without checking. They don't manage their confusion, don't seek clarifications, don't surface inconsistencies, don't present tradeoffs, don't push back when they should." — Andrej Karpathy

**回答任何关于本仓库的问题前，先问自己：我是读了代码，还是在猜？** 没读过相关源码就不回答。命名习惯、既往经验、"一般都是这样"都不是有效来源。

- **管理困惑**：发现不一致或不清楚的地方 → **停下**，说出困惑点，提问。不要默默选一个解释往下做。
- **敢于反驳**：有更简单的做法就说；用户请求里有范围蔓延就指出；方案有隐藏风险就摆出来。不做被动执行者。
- **摆出取舍**：存在多个可行方案时，先列选项再选，让用户决定。

## 1. 沟通与语言

- 与用户交流**一律中文**。
- 仓库文档（`docs/**`、本文件、`CLAUDE.md`、`README.md`、`CHANGELOG.md`）**一律中文**；英文版保留为 `README.en.md` / `CHANGELOG.en.md`。
- 代码标识符、代码注释、commit message **一律英文**。
- 复杂重构或破坏性操作：先在回复里说明计划并获得批准。

## 2. 风险、生产安全与代码质量

- **质量优先**：不确定代码质量就问，不要赶。
- **最小实现**：能 50 行写完的不要写 200 行；不做单次使用的抽象；不加没被要求的"可配置性"。
- **外科手术式改动**：只碰必须碰的；不"顺手改进"相邻代码/注释/格式；不重构没坏的东西；发现无关死代码**说出来，不要删**。
- **改完必须验证**：TypeScript 改动 → `npm run compile`（零 issue，含 `info` 级）；纯 JS 改动 → `node --check <file>`；任何代码改动 → `npm test`。
- **延迟必须给证据**：任何"暂不处理"必须引用**具体阻塞项**。严重级别、频率、"工作量太大"都不是延迟理由。
- **部分格式化**：只格式化新增/修改的代码，**禁止全局重排**。
- **副作用要先声明**：会联网、spawn 进程、装包、发布的命令，先说风险。
- **发布**：发到任何渠道前必须获得用户显式确认。

## 3. 编辑前门禁（自适应）

调用任何写/改工具前先做范围评估：

- **微改动**（错别字、单行 CSS/注释）：一句 `[Pre-edit OK] Scope trivial.` 即可。
- **标准改动**（逻辑变更、重构、多行修改）：**必须**先输出检查清单：
  1. **括号平衡**：本次编辑涉及的 `{}` `[]` `()` 是否对称？
  2. **符号依赖**：删除/改名的符号会不会破坏其他文件？
  3. **验证方案**：改完立刻跑什么命令？
  4. **路径安全**：操作是否限定在目标目录内？
  5. **契约变更**：是否改变函数的异常/返回语义/前置条件/副作用？是则**先** grep 全部调用点，逐个确认兼容再改。
  6. **语言切换**：在 TS / JS / webview 注入 JS 之间切换时，逐条核对语法，不要沿用上一种语言的直觉。

## 4. 任务拆分与流程

- **拆分阈值**：涉及 **≥ 3 个文件** 或 **> 50 行改动** 时，必须先给出子任务清单。
- **单一职责**：每个子任务聚焦一个文件或一组内聚逻辑。
- **零缺陷门**：编译/测试报错 → 任务状态为 **Blocked**，修完再继续。
- **特性节奏**：功能开发严格按 `docs/02-Areas/20260914-04-特性管线规范.md` 的门禁推进；未列入计划的功能**不得顺手实现**。

## 5. 版本控制（Git）

**本仓库使用 git，遵循显式路径提交流程（Zero Global Commit Policy）：**

1. **Status Review**：提交请求时先 `git status` 列出全部变更。
2. **Batch Plan（仅显式路径）**：提交前必须给出 Batch Plan 供评审，包含
   - 全部待提交文件的**显式完整路径**（**禁止** `git add .`、`git add *` 等通配符）；
   - 拟定的 **Commit Message**（英文，Conventional Commits 风格，可带任务号，如 `feat(server): spawn dsh web with OS-assigned port (T2)`）。
3. **Execution Lock**：等用户显式确认（如 "Go"）后才可 `git commit`。**未经确认的提交 FORBIDDEN。**
4. **Push Policy**：`git push` 同样需要显式确认。
5. **No Auto Footer**：不得追加 `Co-Authored-By` 或任何自动生成的脚注。
6. **`.gitignore` 必须覆盖**：`node_modules/`、`.npm-cache/`、`out/`、`*.vsix`、`dist/`、`.spike-dsh-home/`、`spike/`、`*.log`、`.DS_Store`。

## 6. 文档

**落盘位置、命名、写作规则、四维分流** → `docs/02-Areas/20260914-03-文档与PARA规范.md`
**功能开发管线（含门禁与方案写法）** → `docs/02-Areas/20260914-04-特性管线规范.md`
**缺陷修复记录模板** → `docs/02-Areas/20260914-05-缺陷修复记录规范.md`

三条最容易违反的：

1. **当前状态的真源只有一个**：`docs/01-Projects/R20260914-01-演进总览/`。历史主题夹里的行号与数字停留在写作当日，**不要为"对齐现状"去改历史记录**。
2. **事实优先**：现状/差距/协议类内容必须带来源（`文件:行号` 或"<版本> 实测"）；**没读过的代码不写结论，没测过的行为不写事实**。
3. **移动/改名文件后**，全仓 grep 旧路径并全部更新——**包括代码注释里的路径引用**。

## 7. 执行环境与工具

- **运行时**：Node.js ≥ 20（开发机 v24）；npm 11。
- **命令**：

  | 命令 | 作用 |
  |---|---|
  | `npm run compile` | `tsc` 编译（改 TS 后必跑） |
  | `npm run watch` | 增量编译（F5 开发宿主用） |
  | `npm test` | 编译 + 单测 |
  | `npm run package` | 打包到 `dist/`（**只保留最新一份** vsix，文件名带版本号） |
  | `npm run check:dsh` | **核对上游 dsh 跟随状态**（见 §8） |
  | `node scripts/smoke.js` | 真实 dsh 冒烟（CI 三平台用） |
  | `para-structure doctor --json` | 检测 `docs/` 四维结构是否完整 |

- **两种界面形态**（由 `deepseekHarness.openTarget` 决定默认走哪个，见 §7.1 与 `src/openTarget.ts`）：

  | 形态 | 位置 | 何时用 |
  |---|---|---|
  | **次级侧边栏视图**（默认） | VS Code 右侧次级侧边栏，结构上钉死在主侧边栏对面，用户拖不走 | 日常提问；面板窄于 1024px 时 DSH 自带侧边栏会自动收成 56px 轨道 |
  | **编辑器标签页** | 编辑器区，可多开 | 需要并排对比、或要一个宽界面干重活（`Open in Editor Tab` 命令） |

- **所有"打开界面"的路径必须收敛到 `extension.ts` 的 `openUi()` 这一个路由点**——不要在新增路径上自己决定开到哪里，否则设置会在一部分路径上生效、另一部分被静默忽略。

- **环境安装注意**（2026-09-14 实测）：受限沙箱下 `npm install` 会因 lifecycle script 的 piped stdio 报 `spawn EPERM`，本仓依赖全是纯 JS/类型包，用 `npm install --ignore-scripts` 即可；`node --test` 默认按文件 spawn 子进程，受限环境下用 `node --test --test-isolation=none`。
- **安全约束**：扩展只能向 `127.0.0.1`/`localhost` 代发请求；**不得弱化 DSH 的 `/api` 信任围栏**；`dsh web` 不允许 `--host 0.0.0.0`。
- **目录布局**：

  | 目录 | 内容 |
  |---|---|
  | `src/` | 扩展宿主 TypeScript 源码 |
  | `media/` | webview 注入脚本（纯 JS）与静态资产 |
  | `test/` | 单测（`*.test.js`，`node:test` 零依赖） |
  | `scripts/` | `smoke.js`（冒烟）、`package.js`（打包到 dist）、`check-dsh-latest.js`（上游巡检） |
  | `docs/` | PARA 知识库 |
  | `dist/` | 构建产物：**永远只有一份** vsix（gitignore） |

## 7.1 兼容原则（VS Code 基线）

**两层，不要混为一谈。**

**对外 —— 用最新 API 设计，但不拿 `engines` 当"设计目标"。**

- **设计**用最新 stable 的 API，不要为了"让老编辑器也能装"而绕开新 API、降级实现。
- **`engines.vscode` 是「必须能跑的最低编辑器版本」，不是设计目标。** 取**我们实际要支持的那几个编辑器基线中的最小值**：当前是 VS Code **1.105.1**（本机 F5 用）与 Cursor **1.128.0**（内嵌 VS Code），故为 **`^1.105.0`**。
  - ⚠️ 盲目抬高它**只会把用户（包括你自己）挡在门外，并不会让代码更现代**。2026-09-14 已踩过一次：把它设成 `^1.137.0` 后，Cursor 直接拒绝安装——`Error: not compatible with VS Code '1.128.0'`。
- **必须锁死** `devDependencies["@types/vscode"]` 为**与下限同号**的版本（当前 `1.105.0`，不加 `^`）。原因：`^1.x` 会解析到最新类型，**编译期类型新于引擎下限**时，用到新 API `tsc` 不报错、低版本编辑器却会运行时报崩——这类问题只在用户机器上暴露。
- 调整基线时同步三处：`engines.vscode`、`@types/vscode`、`README.md` / `README.en.md` 的「环境要求」。
- **加功能前先验证目标编辑器支持它**，不要靠推断：
  1. 各编辑器的 VS Code 基线：`code --version` / Cursor 用 `cursor --install-extension` 的报错信息，或读 `<编辑器>\resources\app\package.json` 的 `version`；
  2. 贡献点是否被接受：读该版本源码 `src/vs/workbench/api/browser/viewsExtensionPoint.ts` 的 schema（`additionalProperties: false`，写了不在 schema 里的键**不会注册、也不会报错**）。
  - 已核实：`viewsContainers.secondarySidebar` 在 **1.105.1** 与 **1.128.0** 中都存在（源码实测），1.99 中没有。

**对内 —— 尽量不让已有用户受损。**

- 抬高基线或改变行为时，**尽量保留**旧用户的：设置键名、扩展 ID、会话与工作区数据、命令 id、快捷键。
- **做不到时必须显式记录**：`CHANGELOG.md` 标为破坏性变更，并在对应文档写明影响与迁移办法。
- 已经发生过的例子：2026-09-14 扩展 ID 变更（`creatorliao.deepseek-harness-for-vscode`）——旧 id 的安装与设置不会自动迁移，已记录在 `CHANGELOG.md` 与演进时间线。

**判断口径**：新功能可以用最新 API、可以不支持旧编辑器；但**不要让已经在用的用户升级后突然坏掉**——如果两者冲突，先记录清楚再动手。

## 8. 上游跟随（本项目的生存线）

**本项目的产品定义就是"DSH 的 IDE 合作层"。上游一变，我们就有失效风险**——上游在约一个月内走完 `0.1.0-rc.6 → 0.1.5-rc.2`，其中 **3 次破坏性变更**都让内嵌面板不可用。

- **每次开工前**：`npm run check:dsh`（10 秒）。
- **每次发版前**：`npm run check:dsh -- --strict`；有未适配版本**不得发版**。
- 发现未适配 → 按 `docs/02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md` 走：**逐面核对四个破坏面**（boot 注入形态 / dist 资产路径 / `/api` 认证与 RPC / CLI flags），一个都不能跳。
- **要换内核版本（升级 / 回退 / 换通道）时** → 按 `docs/02-Areas/20260915-01-内核升级最佳实践.md` 的 SOP 走。**铁律：不要在活跃会话上热升级**——那会把正在跑的树换掉，该会话的子进程工具链立刻失效（2026-09-15 实测事故：[11-事件_热升级内核导致会话工具链失效.md](docs/01-Projects/R20260820-01-上游DSH版本适配/11-事件_热升级内核导致会话工具链失效.md)）。顺序固定为：**停会话 → 显式版本安装 → 重启内核 → 四破坏面核对 → 四处登记**。
- **不要用报错文案判断根因**：三次事故报错都是 "Failed to load plugins"，根因完全不同。
- **不要用 CLI 版本号当权威**：CLI 版本与传递依赖版本可能错配，能力判断一律以现场探测为准。
- 与上游交互前，先读 `docs/03-Resources/20260914-01-DSH上游事实与协议速查.md`——那里每条事实都标了核实版本。

## 9. 构建产物约定

- 产物一律落在 **`dist/`**，由 `npm run package` 生成：`dist/creatorliao.deepseek-harness-for-vscode-<version>.vsix`。
- **`dist/` 下永远只有一份** vsix——打包脚本先清空再打包，并校验产物数量必须为 1。
- 文件名必须带**版本号**，任何一份 vsix 都能一眼看出对应哪个版本。
- 导入方式：VS Code / Cursor → 扩展视图 → `...` → **Install from VSIX...**。

## 10. 八荣八耻

以臆猜接口为耻，以查档求证为荣。
以模糊开工为耻，以对齐需求为荣。
以脑补业务为耻，以请示规则为荣。
以新增冗余为耻，以复用存量为荣。
以省略校验为耻，以完备测例为荣。
以乱改架构为耻，以恪守规范为荣。
以不懂装懂为耻，以坦诚存疑为荣。
以批量乱改为耻，以分步迭代为荣。

---

**[Boot Instruction]**：以上规则是"初始化固件"。若观察到任何违反，用户可用关键词 **"Check Rules"** 触发重置。
