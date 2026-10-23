import { useTranslation } from "react-i18next";
import { applyLanguage, currentLanguage, type Language } from ".";

/**
 * The interface language and a way to change it. Reading it through
 * `useTranslation` makes every component that calls this re-render the
 * moment the language changes, with no page reload.
 */
export function useLocale(): { language: Language; setLanguage(language: Language): void } {
  useTranslation(); // subscribes to language changes
  return { language: currentLanguage(), setLanguage: applyLanguage };
}
