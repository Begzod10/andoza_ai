import type { AiDesignPlan, CatalogFurniture, DesignTrim } from '@/lib/api'
import type { FurnitureStyle } from '@/lib/furnitureStyles'
import { inferRole, ROLE_GROUP, type FurnitureRole } from '@/lib/furnitureRole'
import i18n, { type TKey } from '@/i18n'

/**
 * Ready-made styles: the same kind of plan the AI designer makes, written by hand, so a style
 * can be applied at once, free, and when the AI is not answering.
 *
 * A preset names the KIND of furniture it wants ("a sofa against wall C"), not a catalog id: the
 * catalog differs from shop to shop. `presetPlan` finds the pieces in the catalog that is loaded.
 * A kind with no match is left out rather than guessed.
 */

type Kind = 'divan' | 'stol' | 'kreslo' | 'tumba' | 'gilam' | 'shkaf'

/**
 * The role a kind plays when the catalog piece itself says nothing more (its name and category
 * infer only decor). A "stol" may be a dining table: the piece's own role comes first.
 */
const KIND_ROLE: Record<Kind, FurnitureRole> = {
  divan: 'sofa', stol: 'coffee_table', kreslo: 'armchair', tumba: 'tv_unit', gilam: 'rug', shkaf: 'shelf',
}

/** What a kind looks like in the catalog (category and Uzbek name). */
const KIND_MATCH: Record<Kind, RegExp> = {
  divan: /divan|sofa/i,
  stol: /kofe|jurnal|stol|table/i,
  kreslo: /kreslo|armchair|chair/i,
  tumba: /tumba|televizor|\btv\b|komod/i,
  gilam: /gilam|rug|carpet|kovrolin/i,
  shkaf: /shkaf|javon|bookcase|stellaj/i,
}

/**
 * Names that make the best piece of a kind, tried before the generic KIND_MATCH: a TV stand rather
 * than a bedside "tumbochka", a coffee table rather than a dining or writing table.
 */
const KIND_PREFER: Partial<Record<Kind, RegExp>> = {
  tumba: /^(?!.*tumbochka).*(tumba|televizor|\btv\b)/i,
  stol: /kofe|jurnal|coffee/i,
}

interface Preset {
  id: string
  /** Locale keys: read while rendering, so they follow a language change. */
  labelKey: TKey
  /** The furniture style this preset pulls from the catalog first. */
  furnitureStyle: FurnitureStyle
  titleKey: TKey
  summaryKey: TKey
  walls: AiDesignPlan['walls']
  floor: NonNullable<AiDesignPlan['floor']>
  lights: AiDesignPlan['lights']
  furniture: Array<{ kind: Kind }>
  /** The ceiling, skirting and cornice: half of what tells one style from another. */
  trim: DesignTrim
}

export const DESIGN_PRESETS: Preset[] = [
  // The four most asked for in Uzbek flats come first.
  {
    id: 'neoklassika', labelKey: 'studio.lib.preset.neoklassika.label', furnitureStyle: 'neoklassika', titleKey: 'studio.lib.preset.neoklassika.title',
    summaryKey: 'studio.lib.preset.neoklassika.summary',
    walls: { main: { type: 'paint', color: '#efe9df' }, accent: { wall: 'C', color: '#d9cdb8' } },
    floor: { type: 'parquet', pattern: 'herringbone', tint: '#c8a27a' },
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_B' }, { type: 'bra', zone: 'wall_D' }],
    furniture: [{ kind: 'divan' }, { kind: 'kreslo' }, { kind: 'stol' }, { kind: 'gilam' }, { kind: 'tumba' }],
    trim: { ceiling: { design: 'double_layer', settings: { color: '#f4f1ea', strip: true, stripK: 3000 } }, skirting: { id: 'b054' }, cornice: { id: 't140' } },
  },
  {
    id: 'zamonaviy', labelKey: 'studio.lib.preset.zamonaviy.label', furnitureStyle: 'zamonaviy', titleKey: 'studio.lib.preset.zamonaviy.title',
    summaryKey: 'studio.lib.preset.zamonaviy.summary',
    walls: { main: { type: 'paint', color: '#d9d6d0' }, accent: { wall: 'C', color: '#8c8a86' } },
    floor: { type: 'laminate', pattern: 'wood_strip', tint: '#a88b6a' },
    lights: [{ type: 'led_linear', zone: 'center' }, { type: 'downlight', zone: 'wall_A' }, { type: 'floor_lamp', zone: 'corner_CD' }],
    furniture: [{ kind: 'divan' }, { kind: 'stol' }, { kind: 'tumba' }, { kind: 'gilam' }],
    trim: { ceiling: { design: 'flat', settings: { color: '#f2f1ee', strip: true, stripK: 3000 } }, skirting: { id: 'tekis' }, cornice: null },
  },
  {
    id: 'hitech', labelKey: 'studio.lib.preset.hitech.label', furnitureStyle: 'hitech', titleKey: 'studio.lib.preset.hitech.title',
    summaryKey: 'studio.lib.preset.hitech.summary',
    walls: { main: { type: 'paint', color: '#f4f5f6' }, accent: { wall: 'C', color: '#2b2f33' } },
    floor: { type: 'tile', pattern: null, tint: null },
    lights: [{ type: 'led_panel', zone: 'center' }, { type: 'led_track', zone: 'wall_A' }, { type: 'spotlight', zone: 'wall_C' }],
    furniture: [{ kind: 'divan' }, { kind: 'stol' }, { kind: 'tumba' }],
    trim: { ceiling: { design: 'floating', settings: { color: '#ffffff', strip: true, stripK: 4000 } }, skirting: { id: 'tekis' }, cornice: null },
  },
  {
    // The studio has no ganch or islimi texture yet: a warm floral wallpaper, dark
    // walnut, a chandelier and a rug give the feel with what it can draw.
    id: 'milliy', labelKey: 'studio.lib.preset.milliy.label', furnitureStyle: 'milliy', titleKey: 'studio.lib.preset.milliy.title',
    summaryKey: 'studio.lib.preset.milliy.summary',
    walls: { main: { type: 'oboy', pattern: 'gul', base_color: '#f3e6cf', accent_color: '#9e2b25' } },
    floor: { type: 'parquet', pattern: 'herringbone', tint: '#6b3f22' },
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_B' }, { type: 'bra', zone: 'wall_D' }],
    furniture: [{ kind: 'divan' }, { kind: 'gilam' }, { kind: 'stol' }, { kind: 'kreslo' }, { kind: 'shkaf' }],
    trim: { ceiling: { design: 'recessed', settings: { color: '#f3e6cf', strip: true, stripK: 2700 } }, skirting: { id: 'b055' }, cornice: { id: 't56' } },
  },
  {
    id: 'dark', labelKey: 'studio.lib.preset.dark.label', furnitureStyle: 'zamonaviy', titleKey: 'studio.lib.preset.dark.title',
    summaryKey: 'studio.lib.preset.dark.summary',
    walls: { main: { type: 'paint', color: '#2c2c2c' }, accent: { wall: 'C', color: '#1a1a1a' } },
    floor: { type: 'parquet', pattern: 'herringbone', tint: '#3d2b1f' },
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_BC' }, { type: 'led_linear', zone: 'wall_C' }],
    furniture: [{ kind: 'divan' }, { kind: 'stol' }, { kind: 'gilam' }, { kind: 'tumba' }, { kind: 'kreslo' }],
    trim: { ceiling: { design: 'border', settings: { color: '#2f2f2f', strip: true, stripK: 2700 } }, skirting: { id: 'tekis' }, cornice: null },
  },
  {
    id: 'skandinav', labelKey: 'studio.lib.preset.skandinav.label', furnitureStyle: 'skandinav', titleKey: 'studio.lib.preset.skandinav.title',
    summaryKey: 'studio.lib.preset.skandinav.summary',
    walls: { main: { type: 'paint', color: '#f5f3ee' }, accent: { wall: 'C', color: '#dcd6c8' } },
    floor: { type: 'laminate', pattern: 'wood_strip', tint: '#d2b48c' },
    lights: [{ type: 'pendant', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_CD' }, { type: 'spotlight', zone: 'wall_A' }],
    furniture: [{ kind: 'divan' }, { kind: 'stol' }, { kind: 'gilam' }, { kind: 'kreslo' }],
    trim: { ceiling: { design: 'flat', settings: { color: '#ffffff', strip: false } }, skirting: { id: 'tekis' }, cornice: null },
  },
  {
    id: 'klassik', labelKey: 'studio.lib.preset.klassik.label', furnitureStyle: 'klassik', titleKey: 'studio.lib.preset.klassik.title',
    summaryKey: 'studio.lib.preset.klassik.summary',
    walls: { main: { type: 'oboy', pattern: 'damask', base_color: '#f5f1e6', accent_color: '#d4af37' } },
    floor: { type: 'parquet', pattern: 'herringbone', tint: '#8a5a33' },
    lights: [{ type: 'chandelier', zone: 'center' }, { type: 'bra', zone: 'wall_B' }, { type: 'floor_lamp', zone: 'corner_AB' }],
    furniture: [{ kind: 'divan' }, { kind: 'kreslo' }, { kind: 'stol' }, { kind: 'gilam' }, { kind: 'shkaf' }],
    trim: { ceiling: { design: 'double_layer', settings: { color: '#f5f1e6', strip: true, stripK: 2700 } }, skirting: { id: 'b053' }, cornice: { id: 't339' } },
  },
  {
    id: 'loft', labelKey: 'studio.lib.preset.loft.label', furnitureStyle: 'loft', titleKey: 'studio.lib.preset.loft.title',
    summaryKey: 'studio.lib.preset.loft.summary',
    walls: { main: { type: 'paint', color: '#4a4a4a' }, accent: { wall: 'C', color: '#a0522d' } },
    floor: { type: 'concrete', pattern: null, tint: null },
    lights: [{ type: 'track', zone: 'center' }, { type: 'floor_lamp', zone: 'corner_AB' }, { type: 'spotlight', zone: 'wall_C' }],
    furniture: [{ kind: 'divan' }, { kind: 'stol' }, { kind: 'tumba' }, { kind: 'kreslo' }],
    trim: { ceiling: { design: 'non_drop', settings: { color: '#bdbab4' } }, skirting: { id: 'tekis' }, cornice: null },
  },
  {
    id: 'minimalist', labelKey: 'studio.lib.preset.minimalist.label', furnitureStyle: 'minimalist', titleKey: 'studio.lib.preset.minimalist.title',
    summaryKey: 'studio.lib.preset.minimalist.summary',
    walls: { main: { type: 'paint', color: '#ffffff' }, accent: { wall: 'C', color: '#e8e8e8' } },
    floor: { type: 'tile', pattern: null, tint: null },
    lights: [{ type: 'led_panel', zone: 'center' }, { type: 'downlight', zone: 'wall_A' }],
    furniture: [{ kind: 'divan' }, { kind: 'stol' }],
    trim: { ceiling: { design: 'non_drop', settings: { color: '#ffffff' } }, skirting: { id: 'tekis' }, cornice: null },
  },
]

/**
 * The catalog piece of this kind that best suits the style, then the room. A piece of the style
 * scores 2, an unstyled one (fits every style) 1, another style 0; the room scores the same way.
 * Style outranks room; a tie keeps catalog order. `styles` may be missing on an old cached catalog.
 */
function pick(
  kind: Kind, catalog: CatalogFurniture[], roomType: string | undefined, used: Set<string>, style: FurnitureStyle,
): CatalogFurniture | undefined {
  let best: CatalogFurniture | undefined
  let bestScore: [number, number, number] = [-1, -1, -1]
  for (const c of catalog) {
    // A listing without a 3-D model (a photo-only shop item) cannot be placed in the studio.
    if (!c.glb_url || used.has(c.id) || !KIND_MATCH[kind].test(`${c.category} ${c.name_uz}`)) continue
    const styles = c.styles ?? []
    const score: [number, number, number] = [
      KIND_PREFER[kind]?.test(c.name_uz) ? 1 : 0,
      styles.includes(style) ? 2 : styles.length === 0 ? 1 : 0,
      c.room_type === roomType ? 2 : c.room_type === null ? 1 : 0,
    ]
    const better = score.findIndex((v, i) => v !== bestScore[i])
    if (better !== -1 && score[better] > bestScore[better]) {
      best = c
      bestScore = score
    }
  }
  return best
}

/**
 * A preset is written with walls A-D meaning "the first to fourth wall". In a room whose walls are
 * called something else (a drawn room's W1..Wn) they are the walls at those positions, wrapping round
 * when the room has fewer.
 */
function resolveWalls(zone: string, wallIds: string[]): string {
  if (wallIds.length === 0) return 'center'
  const at = (letter: string) => wallIds[('ABCD'.indexOf(letter) + wallIds.length) % wallIds.length]
  const wall = zone.match(/^wall_([A-D])$/)
  if (wall) return `wall_${at(wall[1])}`
  const corner = zone.match(/^corner_([A-D])([A-D])$/)
  if (corner) return `corner_${at(corner[1])}_${at(corner[2])}`
  return zone
}

/** The plan for a preset with its furniture taken from `catalog`. Undefined for an unknown id. */
export function presetPlan(
  id: string, catalog: CatalogFurniture[], roomType?: string, wallIds: string[] = ['A', 'B', 'C', 'D'],
): AiDesignPlan | undefined {
  const preset = DESIGN_PRESETS.find((p) => p.id === id)
  if (!preset) return undefined
  const used = new Set<string>()
  const furniture: AiDesignPlan['furniture'] = []
  for (const want of preset.furniture) {
    const item = pick(want.kind, catalog, roomType, used, preset.furnitureStyle)
    if (!item) continue
    used.add(item.id)
    const inferred = inferRole(item.category, item.name_uz)
    // The piece's own role wins only inside the kind's group: a bedside table picked as a TV unit,
    // or a dining table as a coffee table, would stand in a group with no anchor and be dropped.
    const kindRole = KIND_ROLE[want.kind]
    const role = ROLE_GROUP[inferred] === ROLE_GROUP[kindRole] && inferred !== 'decor' ? inferred : kindRole
    furniture.push({ id: item.id, name: item.name_uz, role })
  }
  const accent = preset.walls.accent
  return {
    title: i18n.t(preset.titleKey), summary: i18n.t(preset.summaryKey),
    walls: {
      ...preset.walls,
      ...(accent ? { accent: { ...accent, wall: resolveWalls(`wall_${accent.wall}`, wallIds).slice(5) } } : {}),
    },
    floor: preset.floor,
    lights: preset.lights.map((l) => ({ ...l, zone: resolveWalls(l.zone, wallIds) })),
    furniture, trim: preset.trim, warnings: [],
  }
}
