import type { AppLanguage } from "./languages";

type Template = { pattern: RegExp; keys: string[]; english: string };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compile once; only known UI copy is translated, never arbitrary market data. */
export function createTranslator(dictionaries: Partial<Record<AppLanguage, Record<string, string>>>) {
  const exact = new Map<string, string>();
  const templates: Template[] = [];
  for (const dictionary of Object.values(dictionaries)) {
    for (const [english, translated] of Object.entries(dictionary)) {
      if (!english.includes("{")) {
        exact.set(english.toLowerCase(), english);
        if (!exact.has(translated.toLowerCase())) exact.set(translated.toLowerCase(), english);
        continue;
      }
      for (const source of [english, translated]) {
        const keys: string[] = [];
        const pattern = source.split(/(\{\w+\})/g).map(part => {
          if (!/^\{\w+\}$/.test(part)) return escape(part);
          keys.push(part.slice(1, -1));
          return "(.*?)";
        }).join("");
        templates.push({ pattern: new RegExp(`^${pattern}$`, "i"), keys, english });
      }
    }
  }
  templates.sort((a, b) => b.english.replace(/\{\w+\}/g, "").length - a.english.replace(/\{\w+\}/g, "").length);
  function translate(text: string, language: AppLanguage, depth = 0): string {
    if (depth > 4 || !text.trim()) return text;
    const core = text.trim();
    if (core.startsWith("• ")) return text.replace(core, `• ${translate(core.slice(2), language, depth + 1)}`);
    const dictionary = dictionaries[language] ?? {};
    const english = exact.get(core.toLowerCase());
    let result: string | undefined;
    if (dictionary[core] !== undefined && !core.includes("{")) {
      result = dictionary[core];
    } else if (english) {
      result = language === "en" && core.toLowerCase() === english.toLowerCase() ? core : dictionary[english] ?? english;
      if (language !== "en" && core === core.toUpperCase() && core !== core.toLowerCase()) result = result.toUpperCase();
    } else {
      for (const template of templates) {
        const match = core.match(template.pattern);
        if (!match) continue;
        const params = Object.fromEntries(template.keys.map((key, index) => [key, translate(match[index + 1]!, language, depth + 1)]));
        result = (dictionary[template.english] ?? template.english).replace(/\{(\w+)\}/g, (token, key: string) => params[key] ?? token);
        break;
      }
    }
    if (result === undefined && / · | \| |^• /.test(core)) {
      result = core.split(/( · | \| |^• )/).map(part => translate(part, language, depth + 1)).join("");
    }
    return text.slice(0, text.indexOf(core)) + (result ?? core) + text.slice(text.indexOf(core) + core.length);
  }
  return translate;
}
