import i18n, { type ParseKeys } from "i18next";
import { initReactI18next } from "react-i18next";
import uz from "./locales/uz.json";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

export type Language = "uz" | "ru" | "en";

/** A key of the locale files, checked by `tsc`: label tables in `lib` hold these and the components translate them while rendering. */
export type TKey = ParseKeys;

/** Each language is named in itself, so a reader can always find theirs. */
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "uz", label: "O'zbekcha" },
  { id: "ru", label: "Русский" },
  { id: "en", label: "English" },
];

export const LANGUAGE_STORAGE_KEY = "andoza.lang";

const INTL_LOCALES: Record<Language, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US" };

export function isLanguage(value: unknown): value is Language {
  return value === "uz" || value === "ru" || value === "en";
}

/** The `Intl` locale for number and date formatting. */
export function intlLocale(language: Language = currentLanguage()): string {
  return INTL_LOCALES[language];
}

/** A language picked while signed in that the account has not saved yet
 *  (the PATCH failed, e.g. offline). Until it is saved it beats the
 *  account's stored language, so a reload does not quietly undo the choice. */
const PENDING_LANGUAGE_KEY = "andoza.lang.pending";

export function pendingLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(PENDING_LANGUAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

export function setPendingLanguage(language: Language | null): void {
  try {
    if (language) window.localStorage.setItem(PENDING_LANGUAGE_KEY, language);
    else window.localStorage.removeItem(PENDING_LANGUAGE_KEY);
  } catch {
    // Storage can be blocked: the choice then lasts until the next reload.
  }
}

/** Where the landing's own switcher used to keep its choice. */
const LEGACY_LANDING_KEY = "andoza.landing.lang";

/** Carries a language picked with the old landing switcher over to the shared key, once. */
function migrateLegacyLanguage(): void {
  try {
    const storage = window.localStorage;
    if (storage.getItem(LANGUAGE_STORAGE_KEY) !== null) return;
    const legacy = storage.getItem(LEGACY_LANDING_KEY);
    if (isLanguage(legacy)) storage.setItem(LANGUAGE_STORAGE_KEY, legacy);
  } catch {
    // Storage can be blocked: nothing to carry over.
  }
}

function storedLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Which language to start in: the signed-in user's own, else the one saved in
 * this browser, else the browser's (ru* / en*), else Uzbek.
 */
export function initialLanguage(userLanguage?: string | null): Language {
  if (isLanguage(userLanguage)) return userLanguage;
  migrateLegacyLanguage();
  const saved = storedLanguage();
  if (isLanguage(saved)) return saved;
  const browser = (typeof navigator !== "undefined" ? navigator.language : "") ?? "";
  if (/^ru/i.test(browser)) return "ru";
  if (/^en/i.test(browser)) return "en";
  return "uz";
}

/** Switches the interface language and remembers it in this browser. */
export function applyLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Storage can be blocked (private window): the language still switches.
  }
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

/** The language the interface is in right now (what `Accept-Language` carries). */
export function currentLanguage(): Language {
  const language = i18n.resolvedLanguage ?? i18n.language;
  return isLanguage(language) ? language : "uz";
}

/** The language the page was opened with (`?lang=ru`). The mobile app passes
 *  its own, so the Studio in its WebView matches the app. */
export function languageFromUrl(): Language | null {
  try {
    const value = new URLSearchParams(window.location.search).get("lang");
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

const urlLanguage = languageFromUrl();
// Kept as pending, so the session check saves it on the account instead of
// switching back to the account's own language.
if (urlLanguage) {
  setPendingLanguage(urlLanguage);
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, urlLanguage);
  } catch {
    // Storage can be blocked: the page still opens in that language.
  }
}
const startLanguage = urlLanguage ?? initialLanguage();

void i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru }, en: { translation: en } },
  lng: startLanguage,
  fallbackLng: "uz",
  supportedLngs: ["uz", "ru", "en"],
  interpolation: { escapeValue: false }, // React escapes
  initAsync: false,
  react: { useSuspense: false },
});

if (typeof document !== "undefined") document.documentElement.lang = startLanguage;

export default i18n;
