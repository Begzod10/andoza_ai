import { useTranslation } from "react-i18next";
import { useAuthStore, saveAccountLanguage } from "@/store/authStore";
import { applyLanguage, currentLanguage, type Language } from ".";

/**
 * The interface language and a way to change it. Reading it through
 * `useTranslation` makes every component that calls this re-render the
 * moment the language changes, with no page reload.
 *
 * For a signed-in user the choice is also saved on the account. That save is
 * best effort: if it fails (offline) the interface stays in the new language,
 * nothing is shown, and the choice is kept as pending so the next session
 * check keeps it and saves it again instead of reverting to the account's.
 */
export function useLocale(): { language: Language; setLanguage(language: Language): void } {
  useTranslation(); // subscribes to language changes

  function setLanguage(language: Language) {
    applyLanguage(language);
    const { user, isAuthenticated, setUser } = useAuthStore.getState();
    if (!isAuthenticated) return;
    if (user) setUser({ ...user, language });
    saveAccountLanguage(language);
  }

  return { language: currentLanguage(), setLanguage };
}
