# 方案 · DSH 界面调整与侧边栏收纳

**日期**: 2026-09-14 ｜ **状态**: ✅ **已按推荐路线落地（S1）**｜ **回答**: Q4「想调整官方 DSH UI（比如隐藏/收起侧边栏）有什么解决方案？」
**版本基准**: 前端证据在 **dsh `0.1.2-rc.1` 与 `0.1.5-rc.2` 两版上都逐条复验过**（结论一致，差异已在文中标注）

---

## 0.5 落地记录（2026-09-14）

**采用路线：S1（让面板保持窄 → 官方自动收起）——零改造获得。**

因为界面形态改成了**次级侧边栏**（见 [05-方案](05-方案_面板常驻右侧.md)），面板天然窄于 1024px，DSH 自带的侧边栏会**自动收成 56px 轨道**，每次加载都是这个状态（它由宽度推导，天然"持久"）。

**因此本轮没有加任何注入脚本或 CSS 覆盖** —— S3/S4 按原推荐留作后备：若你实测后觉得 56px 轨道仍占地方，再上 S3（注入脚本自动点「收起侧边栏」，~20 行，需按上游 DOM 核对）；确需 0px 完全隐藏才动 S4。

**⚠️ 尚未做真机验证**：窄栏下"自动收起"的实际观感没有在 F5 里实测过，见 [../R20260914-01-演进总览/03-待办总表.md](../R20260914-01-演进总览/03-待办总表.md)。

---

## 0. 先给结论（四句话）

1. **DSH 官方 UI 本来就能收起侧边栏** —— 收起后保留一条 **56px 图标轨道**，侧边栏顶部有个「**收起侧边栏**」按钮。这是官方功能，不用改任何代码。
2. **而且它会自动收起** —— 只要 DSH 面板的**内容宽度 < 1024px**，侧边栏**默认就是收起状态**（官方硬编码断点）。这是零改造、最稳的方案，也能顺手和 [05-方案_面板常驻右侧](05-方案_面板常驻右侧.md) 一起拿到。
3. **真正的缺口只有两个**：① **折叠状态不持久化**（官方布局 store 是瞬时的、刷新即重置，且**没有任何设置键**能记住它）；② **官方没有 0 宽"完全隐藏"**（`sidebar === 0` 也只渲染 56px）。
4. 所以你的需求应该聚焦在这两个缺口上，**而不是"造一个折叠功能"**。

---

## 1. 官方布局的真实模型（一手事实）

以下读自 `@deepseek-ai/dsh-client-ui-layout` 与 `@deepseek-ai/dsh-client-ui-sidebar` 的 `lib/client.js` / `lib/types/**`。

### 1.1 三栏框架

DSH 的 Web UI 是一个三栏 `AppFrame`：**左栏（sidebar） | 中栏（会话/center） | 右栏（details，0.1.5 起改名 rightbar）**。

实际 DOM（React 渲染后）：

```html
<div class="<hash>_frame"
     style="grid-template-columns: {sidebar}px minmax(0, 1fr) {rightbar}px"
     data-sidebar-collapsed      <!-- 仅折叠时存在 -->
     data-details-collapsed      <!-- 0.1.2；0.1.5 起为 data-rightbar-collapsed -->
     data-rightbar-fullscreen    <!-- 0.1.5 新增 -->
     data-dragging>              <!-- 仅拖拽中 -->
  <div class="<hash>_sidebarCol">…sidebar 槽位…</div>
  <div class="<hash>_centerCol">…会话…</div>
  <div class="<hash>_detailsCol">…details/rightbar 槽位…</div>
  <div class="<hash>_handle" data-side="sidebar">…拖动手柄…</div>
  <div class="<hash>_handle" data-side="details">…</div>
</div>
```

- 宽度来源是**内联 `grid-template-columns`（三条轨道）**，不是 CSS 变量
- 侧栏与右栏都能拖动调整；窗口变窄时**只有右栏**先收缩、随后自动关闭
- 关闭的侧栏保留 **56px 控制栏**；右栏关闭到零宽度（但仍挂载）

### 1.2 几何常量（`lib/types/client/columns.d.ts` + `lib/client.js`）

| 常量 | 值 | 含义 |
|---|---|---|
| `CENTER_MIN` | 400 | 中栏保护宽度 |
| `SIDEBAR_MIN` / `SIDEBAR_MAX` | 264 / 420 | 拖动范围 |
| `SIDEBAR_DEFAULT` | 280 | 默认宽度 |
| **`SIDEBAR_COLLAPSED`** | **56** | **收起后保留的轨道宽度**（"24px 图标列 + 两侧各 16px 内边距"） |
| **`SIDEBAR_AUTO_COLLAPSE`** | **1024** | **低于此视口宽度自动收起** |
| `RIGHTBAR_MIN` | 300 | 右栏下限 |

### 1.3 布局 store：宽度即偏好，且**不持久化**

```js
// createLayoutStore()
init: () => ({ sidebar: 280, details: 0, narrow: false, narrowExpanded: false })

actions: {
  setSidebar:    (d, px) => { d.sidebar = clampWidth(px, 264, 420); },  // ⚠️ 钳到 264..420
  toggleSidebar: (d) => {
    if (d.narrow) d.narrowExpanded = !d.narrowExpanded;    // 窄屏时切"临时展开"覆盖位
    else          d.sidebar = d.sidebar === 0 ? 280 : 0;   // 宽屏时在 0 与 280 之间切
  },
  setNarrow: (d, narrow) => { ...; d.narrowExpanded = false; },
  openDetails / closeDetails
}
```

| 推论 | 依据 |
|---|---|
| 默认**展开**（`sidebar: 280`） | `init()` 初值 |
| **`sidebar === 0` 才算收起**，渲染成 56px | `computeColumns`: `const s = sidebar === 0 ? 56 : clampWidth(sidebar, 264, 420)` |
| `setSidebar(0)` **做不到收起**（被钳到 264），只有 `toggleSidebar()` 会写 0 | `setSidebar` 的 clamp |
| **折叠状态零持久化** | 官方 README 原文："瞬时布局 store …**从不读写 `localStorage`**"；"面板几何是瞬时状态——**重新加载会恢复侧栏默认值**" |

**并且没有任何设置键能记住它** —— 我把 DSH 前端的设置命名空间全查了一遍，只有 4 个，**没有一个是 sidebar/layout**：

| 命名空间 | 字段 | 默认 |
|---|---|---|
| `ui-theme` | `preference: 'light'\|'dark'\|'system'`、`fontSize: 12..17` | `system` / `14` |
| `ui-conversation` | `busyEnter: 'queue'\|'steer'` | `queue` |
| `ui-chat` | `transcriptView`（枚举） | — |
| `ui-onboarding` | `welcomeNoticeVersion: string` | — |

前端 `localStorage` 也只有两个键，都与会话相关：`dsh.conversation`、`dsh.conversation.contentWidth`。（`sessionStorage` 零命中。）

### 1.4 自动折叠断点是怎么量的

```js
const SIDEBAR_AUTO_COLLAPSE = 1024;
const [viewport, setViewport] = useState(() => window.innerWidth);
// ResizeObserver 观测 AppFrame 元素自身宽度 → setViewport(width)
const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0;
```

**量的是 AppFrame 元素的实际宽度**（不是宿主窗口宽度）。而 AppFrame 填满我们的 webview 面板 —— **所以"面板有多宽"直接决定侧边栏收不收**。

**页面初始即为收起状态时会静态渲染轨道**（不做 150ms 动画）—— 这点很重要：如果在挂载前就把状态改掉，用户看不到折叠动画。

### 1.5 官方折叠控件

```js
// ui-sidebar/lib/client.js
"toggle.open": "打开侧边栏",      "toggle.collapse": "收起侧边栏"       // 中文
"toggle.open": "Open sidebar",   "toggle.collapse": "Collapse sidebar" // 英文
<Tooltip label={collapsed ? t("toggle.open") : t("toggle.collapse")}>
  <button class="<hash>_iconButton <hash>_toggle"
          aria-label={collapsed ? t("toggle.open") : t("toggle.collapse")}
          onClick={toggleSidebar} />
```

- 位置：侧边栏顶部品牌行旁（`logoRow`）
- **这是唯一的手动入口** —— 我确认过：**没有键盘快捷键、没有斜杠命令、没有命令面板项**，属性用的是 `aria-label`（不是 `title`）
- 折叠态下点击导航区也会自动展开
- 折叠动画 150ms；文案在 `0.1.2-rc.1` 与 `0.1.5-rc.2` 两版**完全一致**

---

## 2. 你想要的效果 vs 官方能力

| 你想要的 | 官方能力 | 缺口 |
|---|---|---|
| 侧边栏别老占地方 | ✅ 能收成 56px 轨道（按钮 / `ctx.layout.toggleSidebar()`） | 无 |
| 自动收起、不用每次手点 | ✅ **面板 < 1024px 时默认收起** | 无（面板够窄即可） |
| **完全隐藏（0px）** | ❌ **官方没有任何入口**：`sidebar === 0` 也只到 56px | **要自己补** |
| **每次 reload 都保持收起** | ❌ 布局 store 瞬时，且**无设置键** | **要自己补** |

---

## 3. 方案清单（按可靠性排序）

### 🟢 S1 · 让面板保持窄（< 1024px）→ 官方自动收起【强烈推荐，零改造】

把 DSH 面板放在**右侧次级侧边栏**或任何宽度 < 1024px 的容器里，侧边栏自动就是收起的 56px 轨道，**且每次加载都是这个状态**（从宽度推导，天然"持久"）。

- **稳定性** ★★★★★（官方设计行为）｜**工作量** 0｜**副作用** 无
- **代价**：面板变窄；面板一旦被拉宽到 ≥ 1024px 就恢复展开 → 只适合"固定右侧栏"的用法
- 落地：见 [05-方案_面板常驻右侧](05-方案_面板常驻右侧.md)

### 🟢 S2 · 用官方的「收起侧边栏」按钮【零改造，手动】

- **稳定性** ★★★★★｜**代价**：**每次 reload 都要重新点**
- 适合接受"偶发手动"的场景

### 🟡 S3 · 注入脚本，加载后自动点一次折叠按钮【S1 的补充】

我们现在**本来就有注入能力**（见 [02-教程](02-教程_对官方DSH的定制清单.md) 的 A7–A10，`assembleDocument()` 会往 `<head>` 注入脚本），加 20 行即可：

```js
(function () {
  var SEL = [
    'button[aria-label="收起侧边栏"]',      // zh-CN
    'button[aria-label="Collapse sidebar"]' // en
  ].join(",");
  var tries = 0;
  var timer = setInterval(function () {
    if (++tries > 40) return clearInterval(timer);   // 最多等 ~10s
    var btn = document.querySelector(SEL);
    if (btn) { btn.click(); clearInterval(timer); }
  }, 250);
})();
```

- **稳定性** ★★★☆☆｜**工作量** 低｜**只到 56px**（得不到 0 宽）
- **限制**：依赖**界面语言**（DSH 有 9 语言，这里只覆盖中英；其余语言需补文案）；依赖它仍是 `button`
- ✅ 好消息：这两条中文/英文文案在 `0.1.2-rc.1` 与 `0.1.5-rc.2` **实测一致**
- **必须登记**：这是"依赖上游 DOM"的脆弱改动 → 按 [上游兼容规范](../../02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md) §7 教训 3，要**加锁定测试 + 匹配失败时大声失败**，并写进 `dsh-baseline.json`（**本轮已登记** `frontend-layout-constants`）

### 🟡 S4 · 把 56px 轨道压到 0（"完全隐藏"的唯一现实路径）

官方没有 0 宽入口，所以只能覆盖布局。**关键是选对挂钩子**：

| 挂钩 | 能不能用 | 说明 |
|---|---|---|
| `[data-sidebar-collapsed]` | ✅ **推荐** | **版本稳定的公共钩子**（`0.1.2-rc.1` 与 `0.1.5-rc.2` 都有），是 AppFrame 折叠时自动加的属性；官方自己的样式里没用它，但 **DSH Desktop 的外壳 CSS 在用**（`.dshDesktopFrame[…][data-sidebar-collapsed] .dshDesktopUpstreamSidebar{width:56px}`）→ 说明它本来就是留给外部样式/脚本的钩子 |
| CSS Module 类名（`.pI_x6G_frame` / `_1qAH1q_frame`） | ⛔ **禁止** | **hash 前缀跨版本会变**，上游一升级就静默失效 |
| `aria-label` 文案 | ⚠️ 谨慎 | 两版一致，但受界面语言影响 |

**注意一个坑**：宽度是**内联的三轨 `grid-template-columns`**，纯 CSS 覆盖需要 `!important` 且**必须写全三条轨道**，而右栏宽度是动态 px —— 写死会破坏右栏布局。**更稳的变体是用 JS 读当前内联值、只把第一轨改成 0、再写回**：

```js
// 伪代码：只动第一轨，保留中/右轨
var frame = document.querySelector("[data-sidebar-collapsed]") || document.querySelector("[data-dragging]");
// 更稳的取值方式：从 CSS 变量的 frame 元素上读 style.gridTemplateColumns，切成 3 段后改第 0 段
// 并挂 MutationObserver 对抗 React 重渲染
```

- **稳定性** ★★☆☆☆｜能拿到 **0 宽**｜**要自己处理 React 重渲染**
- 属于"碰官方 DOM"的改法，上游一改布局就要跟着改

### 🟠 S5 · 自写 DSH 客户端插件，走官方扩展点【最正规】

官方把面板动作注册成 `ctx.layout` 服务，**契约是公开的**（`dsh-client-ui-layout/lib/types/client/service.d.ts`）：

> `toggleSidebar()` —— "Toggle the sidebar panel (closed ⟷ contract default width)"

而且官方还有一个**专门留给扩展的 additive 槽位**：

> `sidebar.footer.action` —— "Optional actions beside Settings at the sidebar foot"（list 槽位，**可叠加，不会遮蔽既有 UI**）

所以"正规做法"是：写一个 DSH 客户端插件 → 在 `sidebar.footer.action` 放一个自己的按钮 → 调 `ctx.layout.toggleSidebar()`。

**为什么现在不推荐**：`ctx` 是页面内 Cordis 容器的私有对象，前端只对外暴露 `window.__ModuleLoader__`（模块注册器）与 `window.__DSH_BOOT__`（boot 清单），**没有公开句柄**。要拿到 `ctx` 就得**按官方插件机制发布一个 DSH 插件包**，超出本 VS Code 扩展的范围。

> 相关线索（未验证、不适合做产品默认行为）：DSH 有"动态包"机制能让模型在运行时创建含浏览器代码的临时插件，但**需要人在页面上批准**、且 **DSH 重启即消失**——只适合做原型验证。

**顺带**：如果你要改的是**配色**而不是布局，官方有更干净的入口 —— `ctx.theme.overrideTokens(source, tokens)`（叠加 token 覆盖，不碰 CSS、不动基础主题）与 `ctx.theme.register({id, colorScheme, tokens})`。

### 🔵 S6 · 提上游 issue / PR【最干净，最慢】

诉求可以很具体：

> ① 布局面板几何偏好可持久化（现在刷新即重置，且没有任何设置键）；
> ② 或在外观设置里加一个"默认折叠侧边栏"选项；
> ③ 顺带：`sidebar === 0` 目前仍渲染 56px 轨道，若希望支持 0 宽完全隐藏，请提供一个正式入口。

符合 [产品定位与边界](../../02-Areas/20260914-09-产品定位与边界.md) 的策略：**DSH 已能做的只暴露/编排，需要改 DSH 行为的提上游**（同待办 G-05 的做法）。

---

## 4. 方案对照

| 方案 | 稳定性 | 工作量 | 0px 完全隐藏 | reload 保持收起 | 需随上游核对 |
|---|---|---|---|---|---|
| **S1 面板保持 < 1024px** | ★★★★★ | 0 | ❌（56px） | ✅ 天然 | 只核断点常量 |
| **S2 手点官方按钮** | ★★★★★ | 0 | ❌ | ❌ | 否 |
| **S3 注入脚本自动点按钮** | ★★★☆☆ | 低（~20 行） | ❌ | ✅ | **是**（aria-label + DOM） |
| **S4 JS 把第一轨压到 0** | ★★☆☆☆ | 中 | ✅ | ✅ | **是**（内联布局 + React 重渲染） |
| **S5 自写 DSH 插件** | ★★★★☆ | 高 | ❌ | ✅ | 是（插件 API） |
| **S6 提上游** | ★★★★★ | 低 | 视结果 | 视结果 | 否 |

**建议**：**先用 S1**（和 [05-方案](05-方案_面板常驻右侧.md) 一步同时解决 Q4+Q5）；**若 56px 仍嫌占地方，再上 S3**（并同时提 S6）；**只有确实需要 0 宽时才动 S4**。

---

## 5. 如果要动手：改哪里

| 目标 | 改哪 | 说明 |
|---|---|---|
| 加"自动收起 DSH 侧边栏"开关 | `package.json` → `contributes.configuration` 加 `deepseekHarness.collapseDshSidebar` | 与现有 `deepseekHarness.themeSync` 同一层；**9 语言文案要同步** |
| 注入折叠脚本 | `src/documentAssembly.ts` 的 `bootScript` 附近（`:222-231`） | 照抄 `themeDark` / `sessionPreset` 的入参写法 |
| 让面板更容易 < 1024px | `src/dshPanel.ts` 的 `open()` 或改放次级侧边栏 | 见 [05-方案](05-方案_面板常驻右侧.md) |
| 排障 | 命令面板 → `Open Webview Developer Tools` | 现场验证 `[data-sidebar-collapsed]`、aria-label、内联 `grid-template-columns` |

---

## 6. 避坑清单（都是本次实测出来的）

| 坑 | 事实 |
|---|---|
| ⛔ 用 CSS Module 类名做选择器 | hash 前缀跨版本会变。实测：AppFrame 在 `0.1.5-rc.2` 是 `pI_x6G_frame`，在 `0.1.2-rc.1` 是 `_1qAH1q_frame`；侧边栏根同理（`hHd-Xa_root` vs `x-Wl6W_root`） |
| ⛔ 以为 `setSidebar(0)` 能收起 | 被 `clampWidth(px, 264, 420)` 钳住；只有 `toggleSidebar()` 会写 0 |
| ⛔ 以为折叠状态会记住 | 官方 store 完全不持久化，也**没有设置键**；想记住必须自建（扩展侧 `workspaceState` 或页面 `localStorage`） |
| ⛔ 以为能找到快捷键 | 没有键盘快捷键、没有斜杠命令、没有命令面板项；只有侧边栏那个按钮 |
| ⛔ 去 DSH Desktop 的 `build/` 找前端产物 | 那目录只是 Electron 图标；真正的产物在 `dsh-web-frontend/dist/` |
| ⚠️ 用 `[title="收起侧边栏"]` 选元素 | 它用的是 `aria-label`，没有 `title` |

---

## 7. 版本基准与复核方法

**本次证据覆盖两个版本，结论一致**：

| 来源 | 版本 | 说明 |
|---|---|---|
| `%AppData%\npm\node_modules\@deepseek-ai\dsh` | 包本体 `0.1.5-rc.1`，其内 `dsh-web-frontend` 与 `dsh-client-ui-*` 为 **`0.1.5-rc.2`** | 主要证据源 |
| `%LocalAppData%\Programs\DSH Desktop\...\node_modules\@deepseek-ai` | `0.1.2-rc.1` | 逐条复验 |

⚠️ **一个容易踩的环境陷阱**：`PATH` 上的 `dsh` 实际解析到 **DSH Desktop 的 shim**（`%AppData%\DSH Desktop\host-commands\desktop\bin\dsh.cmd`），所以 `dsh --version` 显示 `0.1.2-rc.1`，**但 npm 全局包其实是 `0.1.5-rc.1`**。排查版本问题时要分清"PATH 上的 dsh"和"npm 全局包"。

**两版间的差异（不影响本方案结论）**：`details` → `rightbar` 改名、`data-details-collapsed` → `data-rightbar-collapsed`、新增 `data-rightbar-fullscreen`；`SIDEBAR_AUTO_COLLAPSE=1024`、`sidebar===0 ⇒ 56px`、`data-sidebar-collapsed`、折叠按钮 aria-label 文案**均一致**。

**复核方法**（用于未来版本）：

```sh
# 看 npm 全局包里的前端与 ui 包版本
node -p "require('<npm-global>/node_modules/@deepseek-ai/dsh-web-frontend/package.json').version"
node -p "require('<npm-global>/node_modules/@deepseek-ai/dsh-client-ui-layout/package.json').version"
# 然后 grep 四个关键点（路径换成上面的 ui-layout / ui-sidebar）
#   1) SIDEBAR_AUTO_COLLAPSE = 1024
#   2) sidebar === 0 ? 56
#   3) data-sidebar-collapsed
#   4) toggle.collapse 的文案
```

只要这四点任一变了，S1/S3/S4 都要重新评估。**本轮已把它们登记进 [dsh-baseline.json](../../02-Areas/dsh-baseline.json) 的 `fragilePoints`（新增字段）**，这样 `npm run check:dsh` 的适配流程里就有据可查。

---

*关联文档：[05-方案_面板常驻右侧.md](05-方案_面板常驻右侧.md) ｜ [02-教程_对官方DSH的定制清单.md](02-教程_对官方DSH的定制清单.md) ｜ [../../02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md](../../02-Areas/20260914-06-上游兼容规范_跟随最新官方DSH.md) ｜ [../../02-Areas/dsh-baseline.json](../../02-Areas/dsh-baseline.json)*
