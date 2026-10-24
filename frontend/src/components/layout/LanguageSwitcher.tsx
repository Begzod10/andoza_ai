import { LANGUAGES } from '@/i18n'
import { useLocale } from '@/i18n/useLocale'
import { cn } from '@/lib/utils'

/**
 * Compact language picker for the pages that have no profile (landing, sign-in).
 * Each language is named in itself so a reader can always find theirs.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage } = useLocale()
  return (
    <div role="group" className={cn('inline-flex items-center gap-0.5 rounded-full border border-line bg-card/80 p-0.5 backdrop-blur', className)}>
      {LANGUAGES.map(({ id, label }) => {
        const active = id === language
        return (
          <button
            key={id}
            type="button"
            lang={id}
            aria-label={label}
            aria-pressed={active}
            onClick={() => setLanguage(id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition-colors',
              active ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink',
            )}
          >
            {id}
          </button>
        )
      })}
    </div>
  )
}
