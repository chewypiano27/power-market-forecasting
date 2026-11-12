import { LANGUAGE_DISPLAY_NAMES, LANGUAGE_PREFERENCES, type LanguagePreference } from "../../i18n/languages";
import type { ResultItem } from "./list/model";

const LANGUAGE_NAMES: Record<LanguagePreference, string> = {
  auto: "System language",
  en: "English",
  es: "Spanish",
  "zh-CN": "Chinese Simplified",
  "zh-TW": "Chinese Traditional",
  ja: "Japanese",
  ko: "Korean",
};

export function matchingLanguages(query: string): LanguagePreference[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const order: readonly LanguagePreference[] = ["en", "es", "zh-CN", "zh-TW", "ja", "ko", "auto"];
  return order.filter((code) => {
    const text = `${code} ${LANGUAGE_DISPLAY_NAMES[code]} ${LANGUAGE_NAMES[code]}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function resolveLanguage(query: string): LanguagePreference | undefined {
  const text = query.trim().toLowerCase();
  if (!text) return undefined;
  const exact = LANGUAGE_PREFERENCES.find((code) =>
    [code, LANGUAGE_DISPLAY_NAMES[code], LANGUAGE_NAMES[code]].some((name) => name.toLowerCase() === text),
  );
  if (exact) return exact;
  const matches = matchingLanguages(query);
  return matches.length === 1 ? matches[0] : undefined;
}

export function languagePickerItems(
  query: string,
  current: LanguagePreference = "auto",
  choose: (language: LanguagePreference) => void,
): { items: ResultItem[]; initialIdx: number } {
  const matches = matchingLanguages(query);
  return {
    items: matches.map((code) => ({
      id: `language:${code}`,
      label: LANGUAGE_DISPLAY_NAMES[code],
      detail: LANGUAGE_NAMES[code],
      category: "Languages",
      kind: "action",
      right: code,
      current: code === current,
      action: () => choose(code),
    })),
    initialIdx: Math.max(0, matches.indexOf(current)),
  };
}
