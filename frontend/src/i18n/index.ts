import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import uz from "./locales/uz.json";
import ru from "./locales/ru.json";
import en from "./locales/en.json";

export type Language = "uz" | "ru" | "en";

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
  migrateLegacyLanguage();
  if (isLanguage(userLanguage)) return userLanguage;
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

const startLanguage = initialLanguage();

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
