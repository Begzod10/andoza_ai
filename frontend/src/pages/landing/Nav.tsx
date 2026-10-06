import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LANGS, useLang } from "./i18n";

function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center rounded-full border border-neutral-200 bg-white/70 p-0.5 backdrop-blur">
      {LANGS.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              active
                ? "bg-neutral-900 text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Nav() {
  const { t } = useLang();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? "border-b border-black/5 bg-white/75 backdrop-blur-md shadow-[0_10px_30px_-20px_rgba(30,41,59,0.5)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="andoza.ai" className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight">andoza.ai</span>
        </a>
        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <Link
            to="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold text-neutral-600 transition-colors hover:bg-white/70 hover:text-neutral-900 sm:inline-flex"
          >
            {t.nav.login}
          </Link>
          <Link
            to="/login"
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-neutral-800"
          >
            {t.nav.start}
          </Link>
        </div>
      </div>
    </header>
  );
}
