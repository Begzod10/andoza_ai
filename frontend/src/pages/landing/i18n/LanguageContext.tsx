import { createContext, useContext, useState, type ReactNode } from "react";
import { translations, type Locale, type LandingCopy } from "./translations";

const STORAGE_KEY = "andoza_landing_lang";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: LandingCopy;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLocale(value: string | null): value is Locale {
  return value === "uz" || value === "ru" || value === "en";
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode, blocked storage) — default below
  }
  return "uz";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // per-viewer convenience only — fine if it can't persist
    }
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
