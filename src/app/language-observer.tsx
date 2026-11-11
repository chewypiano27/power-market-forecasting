import { useLayoutEffect } from "react";
import { translateWorkstation } from "../i18n/dom";
import { applyLanguageFromConfig } from "../i18n";
import { useAppSelector } from "../state/app/context";

export function AppLanguageConfigObserver() {
  const language = useAppSelector((state) => state.config.language);

  useLayoutEffect(() => {
    applyLanguageFromConfig({ language });
  }, [language]);

  useLayoutEffect(() => {
    if (typeof document !== "undefined") return translateWorkstation(document.body);
  }, []);

  return null;
}
