import { contactLinks } from '@/lib/storeContact'
import { useTranslation } from 'react-i18next'

/** Call / Telegram shortcuts for the shop behind a catalog model. Renders
 *  nothing when the shop gave no usable contact. */
export function StoreContactLinks({ store }: { store: { phone: string | null; telegram: string | null } | null | undefined }) {
  const { t } = useTranslation()
  const links = contactLinks(store)
  if (links.length === 0) return null
  return (
    <div className="mt-1 flex gap-1">
      {links.map((l) => (
        <a
          key={l.kind}
          href={l.href}
          {...(l.kind === 'telegram' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={(e) => e.stopPropagation()}
          aria-label={l.kind === 'tel' ? t('studio.contact.call_aria', { label: l.label }) : t('studio.contact.telegram_aria', { label: l.label })}
          title={l.label}
          className="flex-1 rounded-md border border-brand/30 px-1.5 py-0.5 text-center text-[10px] font-semibold text-brand hover:bg-brand/5"
        >
          {l.kind === 'tel' ? t('studio.contact.call') : 'Telegram'}
        </a>
      ))}
    </div>
  )
}
