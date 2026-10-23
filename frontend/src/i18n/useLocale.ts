import { useTranslation } from "react-i18next";
import { updateMe } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { applyLanguage, currentLanguage, type Language } from ".";

/**
 * The interface language and a way to change it. Reading it through
 * `useTranslation` makes every component that calls this re-render the
 * moment the language changes, with no page reload.
 *
 * For a signed-in user the choice is also saved on the account. That save is
 * best effort: if it fails (offline) the interface stays in the new language
 * and nothing is shown; the next successful change brings the account along.
 */
export function useLocale(): { language: Language; setLanguage(language: Language): void } {
  useTranslation(); // subscribes to language changes

  function setLanguage(language: Language) {
    applyLanguage(language);
    const { user, isAuthenticated, setUser } = useAuthStore.getState();
    if (!isAuthenticated) return;
    if (user) setUser({ ...user, language });
    updateMe({ language }).then(
      (saved) => {
        const current = useAuthStore.getState().user;
        if (current) setUser({ ...current, ...saved, language: current.language ?? saved.language });
      },
      () => {},
    );
  }

  return { language: currentLanguage(), setLanguage };
}
