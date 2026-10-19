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

export const FURNITURE_STYLES: { id: FurnitureStyle; label: string }[] = [
  { id: 'neoklassika', label: 'Neoklassika' },
  { id: 'klassik', label: 'Klassik' },
  { id: 'zamonaviy', label: 'Zamonaviy' },
  { id: 'hitech', label: 'Hi-Tech' },
  { id: 'minimalist', label: 'Minimalist' },
  { id: 'skandinav', label: 'Skandinav' },
  { id: 'loft', label: 'Loft' },
  { id: 'milliy', label: 'Milliy' },
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
