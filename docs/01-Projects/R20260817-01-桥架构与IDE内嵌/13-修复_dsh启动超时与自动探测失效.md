# 修复 — dsh 启动超时（`did not become ready within 10000ms`）与自动探测失效

**日期**: 2026-09-14
**扩展版本**: 影响 v0.3.4 → 修复 v0.3.4（未发版，随下一个版本发布）
**dsh 版本**: 本机实测 `0.1.5-rc.1`（npm 全局）与 `0.1.2-rc.1`（DSH Desktop shim）**两个版本都受影响**；不是某个 dsh 版本的破坏性变更，而是本项目的超时预算与二进制解析缺陷
**影响面**: 用户点「启动 DeepSeek Harness」后侧边栏报 `错误: dsh did not become ready within 10000ms`，**DSH 完全无法使用**（子进程其实已经起来并在正常打印启动行）
**范围**: `src/serverManager.ts`（超时预算、探测超时、npm 全局前缀探测、spawn 引号、错误信息）、`src/commands.ts`（新增 `dshPath` 设置的读取）+ 5 处启动调用点、`package.json` / `package.nls*.json`（新增设置）、`test/serverManager.test.js`、`scripts/diagnose-dsh.js`（新增诊断工具）
**根因归属**: **本项目代码**（主因：二进制解析 + 超时预算）＋ 平台差异（Windows 的 `npm.cmd` 需要 shell、路径含空格）＋ 上游形态（dsh 每次调用都要加载整棵插件树，启动比 10s 预算慢得多）
**关联**: [10-修复_跨平台dsh解析与spawn.md](10-修复_跨平台dsh解析与spawn.md)（同一主题：二进制解析与 spawn）、[../../03-Resources/20260914-01-DSH上游事实与协议速查.md](../../03-Resources/20260914-01-DSH上游事实与协议速查.md)

---

## 现象

用户截图（侧边栏启动器）：

```
错误: dsh did not become ready within 10000ms
```

- 报的是**就绪超时**，不是"找不到 dsh"，也不是"进程退出" → 说明子进程**起来了并且活着**，只是 10 秒内没打印出我们能识别的启动行。
- 同一台机器上，仓库自带的冒烟脚本 `node scripts/smoke.js` **却能通过**（拿到端口、换到 Cookie）→ 机制本身没坏，问题在**时序预算**与**探测到的二进制**上。

## 根因

### 根因 1（决定性的慢）：`dsh web --port 0` 真实耗时 4.3–9.3 秒，而就绪预算只有 10 秒

2026-09-14 在本机实测（`node scripts/diagnose-dsh.js`，每项 3 次）：

| 二进制 | 打印启动行耗时 | 就绪预算 | 余量 |
|---|---|---|---|
| npm 全局 `0.1.5-rc.1` | **7862 / 7707 / 7379 ms**；另一次 9266 ms | 10 000 ms | **仅 0.7–2.6 s** |
| DSH Desktop shim `0.1.2-rc.1` | 4567 / 4385 / 4348 ms | 10 000 ms | 5.4–5.7 s |

`DEFAULT_READY_TIMEOUT_MS` 是 **10 秒**，而 dsh `0.1.5` 要 **7.4–9.3 秒**。这不是"偶发慢"，是**余量根本不够**：冷启动、杀毒软件扫描、在工作区首次初始化 profile 中的任意一项叠加，就会越线 → 报出 10000ms 超时，而实际一切正常。

### 根因 2（放大器）：Windows 上 npm 全局安装的 dsh **永远探测不到**

```ts
// 修复前
const res = spawnSync("npm", ["prefix", "-g"], { encoding: "utf8" });   // 没有 shell
```

Windows 上 `npm` 是 **`npm.cmd`**，`spawnSync` 不带 `shell: true` **无法执行 `.cmd`** → 抛错 → 被 `catch` 静默吞掉 → `npmGlobalPrefix()` 返回 `""` → `globalDir` 为空 → **npm 全局候选整体被跳过**。

实测证据（修复前 `resolveDshPath().tried`）：

```
    .cmd                                                    ← 伪造条目（见根因 4）
    ~\.npm-global\bin\dsh
    ~\.npm-global\bin\dsh.cmd
    ~\AppData\Local\npm-cache\_npx\*\node_modules\.bin\dsh
    ~\AppData\Local\npm-cache\_npx\*\node_modules\.bin\dsh.cmd
```

**`~\AppData\Roaming\npm\dsh.cmd`（本机真实存在的那个）根本不在探测列表里**，于是 `resolveDshPath()` 返回 `null`，退化成裸 `dsh` 的 PATH 查找——正是 [10-修复_跨平台dsh解析与spawn.md](10-修复_跨平台dsh解析与spawn.md) 当初要消灭的那条脆弱路径。

> **旁证（很有说服力）**：两个既有的 Windows 布局单测 `resolveDshPath handles Windows layout` / `finds either dsh or dsh.cmd` **一直是靠这个 bug 才通过的**——因为系统探测从未发生，注入的临时 home 不会被真机 dsh 遮蔽。修复 `npmGlobalPrefix` 后它们立刻失败，暴露出它们从未传 `{ systemPaths: false }`。已一并修正。

### 根因 3（同族的第三个超时）：`--no-open` 探测超时 5s < `web --help` 实际 4.3–5.3s

`probeNoOpenSupport()` 用 `spawnSync(bin, ["web","--help"], { timeout: 5000 })`，而实测：

| 命令 | 实测耗时 |
|---|---|
| `dsh --version` | **320 ms** |
| `dsh web --help` | **5295 / 4396 / 4286 ms** |
| `dsh web --port 0`（启动行） | 4300–9300 ms |

`web --help` **刚好越过 5 秒**，于是探测**偶发**返回 `null`（表现为 `--no-open: null`），退回到版本号兜底。影响不大（兜底结论恰好正确），但这是同一个病灶：**三个超时都是按"快 CLI"设的，而 dsh 每次调用都要加载整棵插件树。**

### 根因 4（畸形条目）：`$DSH_BIN` 未设置时产生裸后缀候选 `.cmd`

```ts
exeCandidates("", "win32")   // → ["", ".cmd"].filter(Boolean) → [".cmd"]
```

`firstExisting()` 会拿 `.cmd` 去做**相对路径**测试 —— 也就是在工作区目录下找名为 `.cmd` 的文件。命中概率极低，但逻辑上就是错的。

### 根因 5（隐藏地雷）：含空格的绝对路径 + `shell: true` 会被 cmd.exe 拆开

实测（DSH Desktop 的 shim 路径含空格 `…\DSH Desktop\…`）：

```
'D:\Users\liaohai1\AppData\Roaming\DSH' is not recognized as an internal or external command
```

`spawn(bin, args, { shell: true })` 会**不加引号地拼接**命令串，路径含空格时直接失败。本机解析结果目前不含空格，所以没触发，但任何"把编辑器自带的 shim 加进候选"的改动都会立刻踩中。

### 根因 6（可诊断性缺口）：超时报错不含任何证据

原信息只有 `dsh did not become ready within 10000ms`，与"进程卡死"完全无法区分。**本次调查不得不靠在本机另写探针复现**——这就是缺口本身。

## 修复

| # | 改动 | 文件 |
|---|---|---|
| 1 | 就绪预算 `10 000` → **`60 000 ms`**（对最慢实测 9.3s 保留 ~6.5× 余量；期间 UI 一直显示"启动中"） | `serverManager.ts` |
| 2 | `npmGlobalPrefix()` 补 `shell: process.platform === "win32"` + `timeout`，并写明原因 | `serverManager.ts` |
| 3 | 探测预算统一为 `PROBE_TIMEOUT_MS = 20 000`（`--version` 与 `web --help` 共用，>3× 余量） | `serverManager.ts` |
| 4 | `exeCandidates("")` 返回空数组，不再产生裸 `.cmd` | `serverManager.ts` |
| 5 | Windows + 绝对路径时给二进制**加引号**再交给 shell | `serverManager.ts` |
| 6 | 超时错误现在**引用子进程真实输出**：`bin= … version= … stdout="…" stderr="…"`（各截尾 600 字符） | `serverManager.ts` |
| 7 | 用户显式配置了二进制却不存在时，错误**点名该路径**并提示设置项名称，而不是罗列自动探测候选 | `serverManager.ts` |
| 8 | **新增设置 `deepseekHarness.dshPath`**（默认空 = 自动探测；仅在探测选错/失败时才需手工指定）；`dshStartOptions()` 统一 5 处启动调用点 | `package.json`、`package.nls*.json`、`commands.ts`、`extension.ts`、`dshPanel.ts`、`chatView.ts`、`launcherView.ts` |
| 9 | **新增 `npm run diagnose:dsh`**：打印环境、npm 前缀、探测结果、`tried` 列表，并实测启动耗时 | `scripts/diagnose-dsh.js` |

**设计取舍**：`dshPath` 的默认值就是**空 = 自动探测**，配置项只作兜底——**绝大多数用户不需要配任何东西**。真正的修复是让自动探测真的能探到（第 2 条），而不是让用户去手工填路径。

## 验证

| 检查 | 修复前 | 修复后 |
|---|---|---|
| `resolveDshPath().path` | `null`（退化为裸 PATH） | **`D:\Users\liaohai1\AppData\Roaming\npm\dsh`**（version `0.1.5-rc.1`） |
| `tried` 列表 | 含伪造 `.cmd`，缺 npm 全局候选 | 无伪造条目，npm 全局候选在列 |
| `probeNoOpenSupport()` | 偶发 `null` | **`true`**（3 次复测稳定） |
| `npm run compile` | — | 零 issue |
| `npm test` | 98 pass | **100 / 100 pass**（新增 2 条：裸后缀回归、超时错误引用子进程输出） |
| `scripts/smoke.js` | 通过 | 通过 |
| `npm run diagnose:dsh` | 不存在 | 完整输出环境/探测/耗时（本次实测启动 9266 ms，印证 10s 预算不够） |

## 后续建议

- [ ] **在真机（F5 / Cursor）确认面板能起来**——本轮所有结论来自命令行复现，编辑器内尚未实测（与待办 G-17 合并验证）
- [ ] 把这几个超时预算的**实测值**写进上游事实速查，作为下次上游变慢时的对照基线
- [ ] 考虑给 `dshPath` 加"设置的路径不存在时在设置界面提示"（当前只在启动失败时报错）；**优先级低**，先观察真实用户是否会用错
- [ ] 若未来把"编辑器自带 shim"加入自动探测候选，必须先确认引号修复覆盖该路径（含空格），并补一条测试

---

*关联文档：[10-修复_跨平台dsh解析与spawn.md](10-修复_跨平台dsh解析与spawn.md) ｜ [03-教程_启动流程全链路.md](../R20260914-02-DSH内嵌原理与教程/03-教程_启动流程全链路.md) ｜ [../../03-Resources/20260914-01-DSH上游事实与协议速查.md](../../03-Resources/20260914-01-DSH上游事实与协议速查.md) ｜ [../../02-Areas/20260914-05-缺陷修复记录规范.md](../../02-Areas/20260914-05-缺陷修复记录规范.md)*
