import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { PRIVACY_CONTACT, PRIVACY_UPDATED } from "./landing/privacyContent";

interface PrivacyDoc {
  title: string;
  updated: string;
  intro: string;
  /** Paragraphs and, where a string starts with "• ", bullet points. */
  sections: { title: string; body: string[] }[];
  contactLabel: string;
  back: string;
}

function Policy() {
  const { t } = useTranslation();
  const doc = t("landing.privacy", { returnObjects: true }) as PrivacyDoc;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#eef0f4] text-neutral-900">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="andoza.ai" className="h-8 w-8" />
          <span className="text-base font-bold tracking-tight">andoza.ai</span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {doc.updated}: {PRIVACY_UPDATED}
        </p>
        <p className="mt-6 leading-relaxed text-neutral-700">{doc.intro}</p>

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

        {PRIVACY_CONTACT && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">{doc.contactLabel}</h2>
            <p className="mt-2 text-neutral-700">{PRIVACY_CONTACT}</p>
          </section>
        )}

        <Link to="/" className="mt-10 inline-block text-sm font-semibold text-brand hover:underline">
          ← {doc.back}
        </Link>
      </main>
    </div>
  );
}

export default function PrivacyPage() {
  return <Policy />;
}
