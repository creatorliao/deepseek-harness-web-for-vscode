// Central string table — Simplified Chinese only.
// The extension deliberately ships ONE language: maintaining eight extra
// translations cost more than they were worth for a personal-use extension.
// Every user-visible string lives here; package.nls.json carries the manifest
// strings (also Chinese, so no locale can fall back to English).
// Pure module — no vscode import, so it stays unit-testable.

export interface I18nRow {
  zh: string;
}

export const STRINGS = {
  // launcher sidebar
  "launcher.subtitle": {
    zh: "启动并内嵌 DSH Web UI",
  },
  "launcher.stopped": {
    zh: "未启动",
  },
  "launcher.starting": {
    zh: "启动中…",
  },
  "launcher.stopping": {
    zh: "停止中…",
  },
  "launcher.ready": {
    zh: "运行中",
  },
  "launcher.readyVersion": {
    zh: "dsh {version} 运行中",
  },
  "launcher.error": {
    zh: "错误：{message}",
  },
  "button.openChatPanel": {
    zh: "在右侧面板打开",
  },
  "button.openChatEditor": {
    zh: "在编辑器打开",
  },
  "button.start": {
    zh: "启动 DeepSeek Harness",
  },
  "button.stop": {
    zh: "停止 DeepSeek Harness",
  },
  "upgrade.availableLatest": {
    zh: "最新版更新：{latest}",
  },
  "upgrade.availableNext": {
    zh: "预览版更新（next）：{next}",
  },
  "upgrade.current": {
    zh: "当前 {version}",
  },
  "upgrade.recommended": {
    zh: "升级（推荐）",
  },
  "upgrade.copyCommand": {
    zh: "复制命令",
  },
  "upgrade.copyCommandDetail": {
    zh: "复制升级命令到剪贴板",
  },
  "upgrade.commandCopied": {
    zh: "升级命令已复制到剪贴板",
  },
  "upgrade.prefilled": {
    zh: "命令已填入终端 — 按回车执行：{command}",
  },
  "launcher.workspace": {
    zh: "工作区: {name}",
  },
  "launcher.noWorkspace": {
    zh: "未打开文件夹 — DSH 将使用主目录",
  },
  // editor-panel overlay
  "overlay.stopped": {
    zh: "DSH 服务未启动",
  },
  "overlay.starting": {
    zh: "DeepSeek Harness 启动中…",
  },
  "overlay.error": {
    zh: "DSH 错误：{message}",
  },
  // status bar
  "statusbar.stopped": {
    zh: "DeepSeek Harness: 启动",
  },
  "statusbar.starting": {
    zh: "DeepSeek Harness 启动中…",
  },
  "statusbar.ready": {
    zh: "DSH {url}",
  },
  "statusbar.error": {
    zh: "DSH 错误",
  },
  "statusbar.tip.start": {
    zh: "启动 DeepSeek Harness",
  },
  "statusbar.tip.starting": {
    zh: "正在启动 DSH 服务",
  },
  "statusbar.tip.openPanel": {
    zh: "点击打开面板",
  },
  "statusbar.tip.retry": {
    zh: "启动失败，点击重试",
  },
  // commands
  "command.startFailed": {
    zh: "启动 DeepSeek Harness 失败：{message}",
  },
  "command.notRunning": {
    zh: "DeepSeek Harness 未在运行。",
  },
  // session manager (02-session-management T7)
  "sessions.title": {
    zh: "会话",
  },
  "sessions.new": {
    zh: "＋新建会话",
  },
  "sessions.empty": {
    zh: "暂无会话",
  },
  "sessions.newSession": {
    zh: "新会话",
  },
  "sessions.archived": {
    zh: "归档",
  },
  "sessions.rename": {
    zh: "重命名会话",
  },
  "sessions.renamePlaceholder": {
    zh: "输入新标题…",
  },
  "sessions.timeNow": {
    zh: "刚刚",
  },
  "sessions.archive": {
    zh: "归档会话",
  },
  "sessions.error": {
    zh: "会话列表加载失败",
  },
} as const satisfies Record<string, I18nRow>;

export type I18nKey = keyof typeof STRINGS;
export type I18nLang = keyof I18nRow;

/** Replace {name} placeholders in a template string. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}
