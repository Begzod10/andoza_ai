/**
 * Ways to reach a shop from what it entered: a phone number and a Telegram
 * handle. Both are typed by a seller, so each is rebuilt into a link from its
 * validated parts — never used as-is, or a `javascript:` string typed into the
 * Telegram box would become a live link on every buyer's screen.
 */
export interface ContactLink {
  kind: 'tel' | 'telegram'
  href: string
  /** What to show/announce, e.g. "+998 90 123 45 67" or "@mebelplus". */
  label: string
}

/** Digits only, with an optional leading +. Uzbek numbers are 9 digits after 998. */
export function phoneHref(raw: string | null | undefined): { href: string; label: string } | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  // A bare 9-digit local number (90 123 45 67) is an Uzbek mobile.
  const full = digits.length === 9 ? `998${digits}` : digits
  return { href: `tel:+${full}`, label: raw.trim() }
}

/** Accepts @name, name, t.me/name and https://t.me/name; Telegram usernames are 5–32 of [A-Za-z0-9_]. */
export function telegramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?@?([A-Za-z0-9_]{5,32})\/?$/)
  return m ? m[1] : null
}

export function contactLinks(store: { phone: string | null; telegram: string | null } | null | undefined): ContactLink[] {
  if (!store) return []
  const links: ContactLink[] = []
  const phone = phoneHref(store.phone)
  if (phone) links.push({ kind: 'tel', href: phone.href, label: phone.label })
  const tg = telegramHandle(store.telegram)
  if (tg) links.push({ kind: 'telegram', href: `https://t.me/${tg}`, label: `@${tg}` })
  return links
}
