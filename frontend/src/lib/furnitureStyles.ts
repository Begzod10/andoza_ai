import type { TKey } from '@/i18n'

/** The design styles a piece of furniture can suit. Mirrors the backend list;
 *  an empty selection means the piece suits every style. */
export type FurnitureStyle =
  | 'neoklassika'
  | 'klassik'
  | 'zamonaviy'
  | 'hitech'
  | 'minimalist'
  | 'skandinav'
  | 'loft'
  | 'milliy'

export const FURNITURE_STYLES: { id: FurnitureStyle; labelKey: TKey }[] = [
  { id: 'neoklassika', labelKey: 'studio.lib.style.neoklassika' },
  { id: 'klassik', labelKey: 'studio.lib.style.klassik' },
  { id: 'zamonaviy', labelKey: 'studio.lib.style.zamonaviy' },
  { id: 'hitech', labelKey: 'studio.lib.style.hitech' },
  { id: 'minimalist', labelKey: 'studio.lib.style.minimalist' },
  { id: 'skandinav', labelKey: 'studio.lib.style.skandinav' },
  { id: 'loft', labelKey: 'studio.lib.style.loft' },
  { id: 'milliy', labelKey: 'studio.lib.style.milliy' },
]

/** The styles in `raw` the app knows, in the order given: a model saved with a style this
 *  build has never heard of, or an older one without the field, still opens cleanly. */
export function knownStyles(raw?: string[]): FurnitureStyle[] {
  return (raw ?? []).filter((s): s is FurnitureStyle => FURNITURE_STYLES.some((f) => f.id === s))
}

/** The `styles` part of an edit PATCH. The backend marks styles 'manual' whenever `styles`
 *  is sent, which keeps the AI away from the model for good; so they are sent only when the
 *  chips differ from what the model opened with (compared as sets), or when the AI set them
 *  (saving confirms them). Otherwise the key is left out. */
export function stylesPatch(
  initial: FurnitureStyle[],
  chosen: FurnitureStyle[],
  source: string | null | undefined,
): { styles?: FurnitureStyle[] } {
  const a = new Set(initial)
  const b = new Set(chosen)
  const changed = a.size !== b.size || [...a].some((s) => !b.has(s))
  return changed || source === 'ai' ? { styles: chosen } : {}
}
