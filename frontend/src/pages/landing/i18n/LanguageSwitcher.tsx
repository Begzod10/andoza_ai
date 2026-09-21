import { useLanguage } from "./LanguageContext";
import type { Locale } from "./translations";

const LOCALES: { code: Locale; label: string }[] = [
  { code: "uz", label: "UZ" },
  { code: "ru", label: "RU" },
  { code: "en", label: "EN" },
];

interface LanguageSwitcherProps {
  className?: string;
  /** Use on white/light backgrounds instead of navy (e.g. none on this page yet, kept for reuse). */
  variant?: "on-navy" | "on-light";
}

export function LanguageSwitcher({ className = "", variant = "on-navy" }: LanguageSwitcherProps) {
  const { locale, setLocale } = useLanguage();
  const onNavy = variant === "on-navy";

  return (
    <div
      role="group"
      aria-label="Til / Язык / Language"
      className={`inline-flex items-center rounded-full p-0.5 gap-0.5 ${
        onNavy ? "bg-white/10" : "bg-paper"
      } ${className}`}
    >
      {LOCALES.map(({ code, label }) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
              onNavy ? "landing-focus-ring" : "landing-focus-ring-dark"
            } ${
              active
                ? onNavy
                  ? "bg-white text-primary"
                  : "bg-primary text-white"
                : onNavy
                  ? "text-white/70 hover:text-white"
                  : "text-muted hover:text-neutral-900"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
