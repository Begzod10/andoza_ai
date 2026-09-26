import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  const originalHtmlLangRef = useRef<string | null>(null);

  // Keeps <html lang> honest for screen readers/browsers while this page's
  // own locale differs from the rest of the (Uzbek-only) app, and restores
  // whatever it was before on unmount rather than leaving it stuck on
  // whichever landing-page locale was last active.
  useEffect(() => {
    if (originalHtmlLangRef.current === null) {
      originalHtmlLangRef.current = document.documentElement.lang;
    }
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    return () => {
      if (originalHtmlLangRef.current !== null) {
        document.documentElement.lang = originalHtmlLangRef.current;
      }
    };
  }, []);

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
