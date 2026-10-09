import { Link } from "react-router-dom";
import { LANGS, LanguageProvider, useLang } from "./landing/i18n";
import { DELETE_ACCOUNT } from "./landing/deleteAccountContent";

function Guide() {
  const { lang, setLang } = useLang();
  const doc = DELETE_ACCOUNT[lang];

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#eef0f4] text-neutral-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="andoza.ai" className="h-8 w-8" />
          <span className="text-base font-bold tracking-tight">andoza.ai</span>
        </Link>
        <div role="group" aria-label="Language" className="flex gap-1 rounded-full bg-black/5 p-1">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={lang === l.code}
              onClick={() => setLang(l.code)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                lang === l.code ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-4 leading-relaxed text-neutral-700">{doc.intro}</p>

        {doc.sections.map((s) => (
          <section key={s.title} className="mt-8">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <div className="mt-2 space-y-2 leading-relaxed text-neutral-700">
              {s.body.map((line) =>
                line.startsWith("• ") ? (
                  <p key={line} className="pl-4 -indent-4">
                    {line}
                  </p>
                ) : (
                  <p key={line}>{line}</p>
                ),
              )}
            </div>
          </section>
        ))}

        <Link
          to="/login"
          className="mt-8 inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          {doc.login}
        </Link>
        <br />
        <Link to="/" className="mt-10 inline-block text-sm font-semibold text-brand hover:underline">
          ← {doc.back}
        </Link>
      </main>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <LanguageProvider>
      <Guide />
    </LanguageProvider>
  );
}
