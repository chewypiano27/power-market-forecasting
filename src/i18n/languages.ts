const APP_LANGUAGES = ["en", "es", "zh-CN", "zh-TW", "ja", "ko"] as const;

export type AppLanguage = typeof APP_LANGUAGES[number];

export const LANGUAGE_PREFERENCES = ["auto", ...APP_LANGUAGES] as const;

export type LanguagePreference = typeof LANGUAGE_PREFERENCES[number];

export const LANGUAGE_DISPLAY_NAMES: Record<LanguagePreference, string> = {
  auto: "Auto",
  en: "English",
  es: "Español",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
};

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === "string" && (LANGUAGE_PREFERENCES as readonly string[]).includes(value);
}
