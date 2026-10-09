import { Link } from "react-router-dom";
import { useLang } from "./i18n";

export default function Footer() {
  const { t } = useLang();
  const links = [
    { label: t.footer.links.dokon, to: "/login" },
    { label: t.footer.links.ustalar, to: "/login" },
    { label: t.footer.links.kirish, to: "/login" },
    { label: t.footer.privacy, to: "/privacy" },
  ];

  return (
    <footer className="relative z-10 border-t border-black/5 bg-white/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-10 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="andoza.ai" className="h-8 w-8" />
            <span className="text-base font-bold tracking-tight">andoza.ai</span>
          </div>
          <p className="text-sm text-neutral-500">{t.footer.tagline}</p>
        </div>

        <nav className="flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-black/5">
        <p className="mx-auto max-w-6xl px-6 py-5 text-center text-xs text-neutral-400 sm:text-left">
          {t.footer.copyright}
        </p>
      </div>
    </footer>
  );
}
