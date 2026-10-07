import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'

/**
 * Ready-made styles: the same kind of plan the AI designer makes, written by hand, so a style
 * can be applied at once, free, and when the AI is not answering.
 *
 * A preset names the KIND of furniture it wants ("a sofa against wall C"), not a catalog id: the
 * catalog differs from shop to shop. `presetPlan` finds the pieces in the catalog that is loaded.
 * A kind with no match is left out rather than guessed.
 */

type Kind = 'divan' | 'stol' | 'kreslo' | 'tumba' | 'gilam' | 'shkaf'

/** What a kind looks like in the catalog (category and Uzbek name). */
const KIND_MATCH: Record<Kind, RegExp> = {
  divan: /divan|sofa/i,
  stol: /kofe|jurnal|stol|table/i,
  kreslo: /kreslo|armchair|chair/i,
  tumba: /tumba|televizor|\btv\b|komod/i,
  gilam: /gilam|rug|carpet|kovrolin/i,
  shkaf: /shkaf|javon|bookcase|stellaj/i,
}

interface Preset {
  id: string
  label: string
  title: string
  summary: string
  walls: AiDesignPlan['walls']
  floor: NonNullable<AiDesignPlan['floor']>
  lights: AiDesignPlan['lights']
  furniture: Array<{ kind: Kind; zone: string }>
}

export const DESIGN_PRESETS: Preset[] = [
  {
    id: 'dark', label: "Qorong'i", title: "Qorong'i, iliq atmosfera",
    summary: "To'q kulrang devorlar va to'q parket chuqur, xotirjam muhit beradi. Kam va iliq yorug'lik shu kayfiyatni saqlaydi.",
    walls: { main: { type: 'paint', color: '#2c2c2c' }, accent: { wall: 'C', color: '#1a1a1a' } },
    floor: { type: 'parquet', pattern: 'herringbone', tint: '#3d2b1f' },
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_BC' }, { type: 'led_linear', zone: 'wall_C' }],
    furniture: [{ kind: 'divan', zone: 'wall_A' }, { kind: 'stol', zone: 'center' }, { kind: 'gilam', zone: 'center' }, { kind: 'tumba', zone: 'wall_C' }, { kind: 'kreslo', zone: 'corner_CD' }],
  },
  {
    id: 'skandinav', label: 'Skandinav', title: 'Yorug skandinav uslubi',
    summary: "Och devorlar, tabiiy yog'och pol va yumshoq yorug'lik xonani keng va qulay qiladi.",
    walls: { main: { type: 'paint', color: '#f5f3ee' }, accent: { wall: 'C', color: '#dcd6c8' } },
    floor: { type: 'laminate', pattern: 'wood_strip', tint: '#d2b48c' },
    lights: [{ type: 'pendant', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_CD' }, { type: 'spotlight', zone: 'wall_A' }],
    furniture: [{ kind: 'divan', zone: 'wall_C' }, { kind: 'stol', zone: 'center' }, { kind: 'gilam', zone: 'center' }, { kind: 'kreslo', zone: 'corner_AB' }],
  },
  {
    id: 'klassik', label: 'Klassik', title: 'Klassik, oltin detallar',
    summary: "Damask oboy, issiq jigarrang parket va qandil an'anaviy, boy ko'rinish beradi.",
    walls: { main: { type: 'oboy', pattern: 'damask', base_color: '#f5f1e6', accent_color: '#d4af37' } },
    floor: { type: 'parquet', pattern: 'herringbone', tint: '#8a5a33' },
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_B' }, { type: 'floor_lamp', zone: 'corner_AB' }],
    furniture: [{ kind: 'divan', zone: 'wall_C' }, { kind: 'kreslo', zone: 'corner_CD' }, { kind: 'stol', zone: 'center' }, { kind: 'gilam', zone: 'center' }, { kind: 'shkaf', zone: 'wall_A' }],
  },
  {
    id: 'loft', label: 'Loft', title: "Loft: beton va g'isht",
    summary: "Kulrang devorlar, g'ishtsimon devor va beton pol sanoat uslubini beradi, trek chiroqlar buni to'ldiradi.",
    walls: { main: { type: 'paint', color: '#4a4a4a' }, accent: { wall: 'C', color: '#a0522d' } },
    floor: { type: 'concrete', pattern: null, tint: null },
    lights: [{ type: 'track', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_AB' }, { type: 'spotlight', zone: 'wall_C' }],
    furniture: [{ kind: 'divan', zone: 'wall_B' }, { kind: 'stol', zone: 'center' }, { kind: 'tumba', zone: 'wall_C' }, { kind: 'kreslo', zone: 'corner_CD' }],
  },
  {
    id: 'minimalist', label: 'Minimalist', title: 'Minimalist, oq va kulrang',
    summary: "Oq devorlar, och plitka pol va oz sonli mebel xonani toza va sodda qoldiradi.",
    walls: { main: { type: 'paint', color: '#ffffff' }, accent: { wall: 'C', color: '#e8e8e8' } },
    floor: { type: 'tile', pattern: null, tint: null },
    lights: [{ type: 'led_panel', zone: 'center' }, { type: 'downlight', zone: 'wall_A' }],
    furniture: [{ kind: 'divan', zone: 'wall_C' }, { kind: 'stol', zone: 'center' }],
  },
]

/** The first catalog piece of this kind, preferring one made for this kind of room. */
function pick(kind: Kind, catalog: CatalogFurniture[], roomType: string | undefined, used: Set<string>): CatalogFurniture | undefined {
  const fits = catalog.filter((c) => !used.has(c.id) && KIND_MATCH[kind].test(`${c.category} ${c.name_uz}`))
  return fits.find((c) => c.room_type === roomType) ?? fits.find((c) => c.room_type === null) ?? fits[0]
}

/** The plan for a preset with its furniture taken from `catalog`. Undefined for an unknown id. */
export function presetPlan(id: string, catalog: CatalogFurniture[], roomType?: string): AiDesignPlan | undefined {
  const preset = DESIGN_PRESETS.find((p) => p.id === id)
  if (!preset) return undefined
  const used = new Set<string>()
  const furniture: AiDesignPlan['furniture'] = []
  for (const want of preset.furniture) {
    const item = pick(want.kind, catalog, roomType, used)
    if (!item) continue
    used.add(item.id)
    furniture.push({ id: item.id, name: item.name_uz, zone: want.zone })
  }
  return {
    title: preset.title, summary: preset.summary, walls: preset.walls, floor: preset.floor,
    lights: preset.lights, furniture, warnings: [],
  }
}
