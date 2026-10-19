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
