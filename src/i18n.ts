// String lookup for the central table (Simplified Chinese only — the extension
// deliberately ships one language; see i18nStrings.ts).
import { STRINGS, interpolate, type I18nKey } from "./i18nStrings.js";

/** Resolve one key; `vars` fills the `{placeholder}` slots. */
export function t(key: I18nKey, vars?: Record<string, string>): string {
  const text = STRINGS[key].zh;
  return vars ? interpolate(text, vars) : text;
}

/** Document language for `<html lang=...>`. */
export function langCode(): string {
  return "zh-CN";
}
