# 修复 — 全局 dsh 被"半装"导致启动即退码 1（面板报 `dsh exited before ready (code=1, signal=null)`）

**日期**: 2026-09-15
**扩展版本**: 影响 v0.3.4 → 修复 v0.4.0
**dsh 版本**: `0.1.5-rc.2`（**未换版本**；坏的是本机全局安装的完整性，不是版本适配）
**影响面**: **凡是新起 `dsh web` 的路径全部失败**——VS Code / Cursor 面板启动、终端手敲 `dsh web`、`npm run smoke` 皆然；已在运行的旧进程不受影响，所以现象表现为"昨天还好、今天全起不来"
**范围**: `src/serverManager.ts`（新增 `outputHint()`，2 处错误文案接上）、`test/serverManager.test.js`（新增 1 条回归测例）；环境侧：停残留进程 + 重装全局 dsh。**无协议改动、无版本门控改动**
**根因归属**: 平台差异（Windows 文件独占锁 × npm 全局安装的 retire/复制）+ 本项目代码（错误文案吞掉 stderr）
**关联**: [11-事件_热升级内核导致会话工具链失效.md](11-事件_热升级内核导致会话工具链失效.md) ｜ [内核升级最佳实践](../../02-Areas/20260915-01-内核升级最佳实践.md)

## 现象

用户在 VS Code 里点「启动 DeepSeek Harness」，面板直接红字：

```
错误: dsh exited before ready (code=1, signal=null)
```

**只有退出码，没有任何原因**——`dsh --version` 正常（`0.1.5-rc.2`）、`dsh web --help` 正常、`dsh` 在 PATH 上找得到，所以从界面上完全推不出为什么。

在工作区 `D:\code\Recordly` 下**用与扩展完全一致的 spawn 语义**（`shell:true` + 引号包裹绝对路径 + `web --port 0 --no-open`）复现：

```
spawnBin="D:\Users\liaohai1\AppData\Roaming\npm\dsh"
args=["web","--port","0","--no-open"]
cwd=D:\code\Recordly shell=true
=== EXIT code=1 signal=null ===        （耗时 45.6 秒才退出）
```

stderr（截取关键处）：

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): loader entries failed to apply
Error: failed to import loader entry subprocess (@deepseek-ai/dsh-subprocess-local): Mismatched native Koffi modules
Error: failed to import loader entry sandbox (@deepseek-ai/dsh-sandbox-local): Mismatched native Koffi modules
    at wrapNative (…/node_modules/koffi/src/koffi/index.js:197:11)
```

## 根因

### A. 直接原因：koffi 的 JS 包装与原生二进制**版本不一致**

`koffi` 在模块加载时对版本做硬校验，不等就直接抛错（`…/dsh/node_modules/koffi/src/koffi/index.js:193-197`）：

```js
function wrapNative(native2, version2) {
  if (native2 == null) throw new Error("Cannot find the native Koffi module; …");
  if (native2.version != version2) throw new Error("Mismatched native Koffi modules");
```

本机实测两者错位（原生二进制由 `loadStatic()` → `@koromix/koffi-win32-x64` 提供，该包 `index.js` 只有一行 `module.exports = require('./win32_x64/koffi.node')`）：

| 项 | 值 | 来源 |
|---|---|---|
| koffi JS 包装版本 | `3.3.0` | `…/dsh/node_modules/koffi/package.json` |
| 平台包 `package.json` 版本 | `3.3.0` | `…/dsh/node_modules/@koromix/koffi-win32-x64/package.json` |
| **原生二进制自报版本** | **`3.2.1`** | `node -e` 实探 `require('@koromix/koffi-win32-x64').version` |
| 该二进制的哈希与时间戳 | `sha256 8623DC57…F0972B`，1,036,800 B，**mtime 2026-09-12 22:15:11** | 修复前取证 |

`@deepseek-ai/dsh-subprocess-local`、`@deepseek-ai/dsh-sandbox-local` 等 6 个包都依赖 `koffi ^3.1.0`，插件树里任一 entry 加载失败即整体 `failed to apply`，于是 `dsh web` **一行启动行都不打印就退出 1**。

> 为什么 `dsh --version` / `dsh web --help` 都正常？这两条路径**不加载插件树**，所以坏掉的只是"真正要跑起来"的那一步。**不能用 CLI 是否响应来判断内核是否可用。**

### B. 为什么会错配：**上一次全局安装被 Windows 文件锁打断，留下半新半旧的树**

npm 保留的调试日志（`%LocalAppData%\npm-cache\_logs\2026-09-14T23_06_12_040Z-debug-0.log`，本地时间 2026-09-15 07:06，命令 `npm i --global @deepseek-ai/dsh@next`）以失败收尾：

```
error code EBUSY
error syscall copyfile
error path D:\Users\liaohai1\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node
error dest D:\Users\liaohai1\AppData\Roaming\npm\node_modules\@deepseek-ai\.dsh-YBMFo6rE\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node
error EBUSY: resource busy or locked, copyfile …
verbose exit -4082
```

即：npm 要把旧树"退休"（retire）到 staging 目录时，**复制 `koffi.node` 失败**——该文件被一个**还活着的 dsh 进程**独占：

- 占用者：**PID 3216**，命令行 `node …\@deepseek-ai\dsh\lib\bin.js web --host 127.0.0.1 --port 3080 --no-open`，**启动于 2026-09-14 21:38:38**（早于两次安装）；
- 它同时也是**第一次安装（07:05，`@0.1.5-rc.2`）日志出现 `npm warn cleanup EPERM` 的原因**——与 [11-事件](11-事件_热升级内核导致会话工具链失效.md) §3 记的是同一起操作事故；
- 结果：JS 侧文件被换成 3.3.0，**原生二进制仍停在 09-12 的 3.2.1**，形成 A 的错配。

> 本次修复时实测确认该文件的锁定状态：`[System.IO.File]::Open(path,'Open','ReadWrite','None')` → *"being used by another process"*；停掉 PID 3216 后立刻变为可写。**锁的存在与解除都是实测，不是推断。**

**为什么桌面端没坏、正在跑的会话也没坏**：DSH Desktop 用的是它自带的运行时（`…\Programs\DSH Desktop\resources\app`，其中 koffi 原生自报 `3.1.5`，**自洽**），与 npm 全局那棵树无关；PID 3216 之所以还能服务，是因为它在事故**之前**就已把旧模块读进内存。

> 证据留存说明：npm debug 日志默认只保留最近 10 份，本次修复过程中的重装把上述两份挤掉了；关键行已按上表逐字摘录在本记录中，**本记录即该证据的落点**。

### C. 扩展侧的真实缺陷：这个错误本来不必靠人肉排查

`dsh exited before ready (code=1, signal=null)` 把**子进程的 stderr 全丢了**（`src/serverManager.ts` 的 exit 分支），而同文件的**超时**分支早就带着 `stdout=` / `stderr=`。于是同一次故障，走超时路径能看到原因，走退出路径看不到——**根因明明在 stderr 里躺着**。

## 修复

### 1. 环境（让内核重新可用）

```powershell
# 1) 停掉锁住 koffi.node 的残留实例（必须先停，否则 npm 必然再 EBUSY 一次）
Stop-Process -Id 3216 -Force
# 2) 删掉处于"半装"状态的两个包，逼 npm 必须重写它们
Remove-Item "…\@deepseek-ai\dsh\node_modules\@koromix\koffi-win32-x64" -Recurse -Force
Remove-Item "…\@deepseek-ai\dsh\node_modules\koffi" -Recurse -Force
# 3) 显式版本重装（**不换版本**，只补完整性）
npm i -g @deepseek-ai/dsh@0.1.5-rc.2
```

**为什么必须先停进程再删包**：不删包时 npm 会认为 `@koromix/koffi-win32-x64@3.3.0` 已就位（package.json 确实是 3.3.0）而跳过重写，错配会**原样保留**；不先停进程则第 3 步会以相同的 EBUSY 再失败一次。

### 2. 代码（`src/serverManager.ts`）

新增私有 `outputHint()`，接在**两条**子进程退出错误文案后面：

- 摘出 stderr 里**第一条**匹配 `\b(error|exception)\b` 的行（`first error: …`）；
- 再附 stderr 尾部（`stderr=…`），stderr 为空时退回 stdout 尾部。

**为什么要单独摘"第一条 error 行"**：本故障的 stderr 是一棵很长的 AggregateError，而 `OUTPUT_TAIL_BYTES` 只有 600 字节——**尾部 600 字节全是右括号**，只贴尾部等于没贴。二者并用才能在编辑器里一眼看到 `Mismatched native Koffi modules`。

保留原有 `code=` / `signal=` 前缀，故既有断言（`test/serverManager.test.js` 的前缀正则）不受影响。

## 验证

| # | 项 | 结果 |
|---|---|---|
| 1 | 重装后 `@koromix/koffi-win32-x64` 原生自报版本 | ✅ `3.3.0`，与 koffi JS `3.3.0` **一致** |
| 2 | 全局重装退出码 | ✅ `added 66 packages, and changed 518 packages in 1m`，exit `0` |
| 3 | **用与扩展一致的 spawn 语义**在 `D:\code\Recordly` 复现 | ✅ 打印启动行 `dsh web: http://127.0.0.1:9208/?token=…`，不再退码 1 |
| 4 | `npm run compile` | ✅ exit 0，零 issue（含 info 级） |
| 5 | `npm test` | ✅ **105 通过 / 0 失败**（含新增回归测例） |
| 6 | 新增测例是否真的锁住了这个形态 | ✅ `start() quotes the child's own error when it exits before ready`（fake dsh 写 stderr 后退 1，断言 `first error:` 与 `stderr=` 均在文案里） |
| 7 | 残留进程清理 | ✅ 复现用临时进程已回收，端口 9208 无残留 |

## 后续建议

- [ ] 把"**装完必须校验原生二进制与 JS 包装版本一致**"写进 [内核升级最佳实践](../../02-Areas/20260915-01-内核升级最佳实践.md) §4 副作用表与 §10 故障对照表
- [ ] `npm run diagnose:dsh` 增加一条"koffi 原生/JS 版本自检"，把本次的取证命令固化（`require('@koromix/koffi-win32-x64').version` 对比 `koffi/package.json`）
- [ ] 复核 11-事件的 §B（`tsx` 来源）时，顺手确认本次重装后全局树里 `tsx` 是否存在，把悬案收口
- [ ] 评估"启动前预检"：扩展在 spawn 之前先跑一次极轻量的内核自检，把这类"起不来"提前成一条可读提示（**先评估，不直接实现**）
- [ ] 把"npm 全局安装会因运行中实例而半装"补进 [11-事件](11-事件_热升级内核导致会话工具链失效.md) 的后续建议，与本次记录互链

---

*关联文档：[00-README.md](00-README.md) ｜ [11-事件_热升级内核导致会话工具链失效.md](11-事件_热升级内核导致会话工具链失效.md) ｜ [../../02-Areas/20260915-01-内核升级最佳实践.md](../../02-Areas/20260915-01-内核升级最佳实践.md) ｜ [../../02-Areas/20260914-05-缺陷修复记录规范.md](../../02-Areas/20260914-05-缺陷修复记录规范.md)*
