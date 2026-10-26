import type { AiDesignPlan, CatalogFurniture, DesignTrim } from '@/lib/api'
import type { FurnitureStyle } from '@/lib/furnitureStyles'
import { inferRole, ROLE_GROUP, WARDROBE_NAME, type FurnitureRole } from '@/lib/furnitureRole'
import { catalogRoomType } from '@/lib/roomType'
import i18n, { type TKey } from '@/i18n'
import presetData from '@/lib/data/design_presets.json'

/**
 * Ready-made styles: the same kind of plan the AI designer makes, written by hand, so a style
 * can be applied at once, free, and when the AI is not answering.
 *
 * A preset names the KIND of furniture it wants ("a sofa against wall C"), not a catalog id: the
 * catalog differs from shop to shop. `presetPlan` finds the pieces in the catalog that is loaded.
 * A kind with no match is left out rather than guessed.
 */

type Kind = 'divan' | 'stol' | 'kreslo' | 'tumba' | 'gilam' | 'shkaf' | 'karavot' | 'tumbochka' | 'garderob' | 'yozuv_stoli'

/**
 * The role a kind plays when the catalog piece itself says nothing more (its name and category
 * infer only decor). A "stol" may be a dining table: the piece's own role comes first.
 */
const KIND_ROLE: Record<Kind, FurnitureRole> = {
  divan: 'sofa', stol: 'coffee_table', kreslo: 'armchair', tumba: 'tv_unit', gilam: 'rug', shkaf: 'shelf',
  karavot: 'bed', tumbochka: 'nightstand', garderob: 'wardrobe', yozuv_stoli: 'desk',
}

const text = (pattern: RegExp) => (c: CatalogFurniture) => pattern.test(`${c.category} ${c.name_uz}`)
const roleIs = (role: FurnitureRole) => (c: CatalogFurniture) => inferRole(c.category, c.name_uz) === role

/**
 * What a kind looks like in the catalog (category and Uzbek name). The bedroom kinds are the roles
 * the layout reads the piece as, so a "Kompyuter stuli" is no desk; a wardrobe is one for clothes
 * (`WARDROBE_NAME`), not any "shkaf" such as a bookcase.
 */
const KIND_MATCH: Record<Kind, (c: CatalogFurniture) => boolean> = {
  divan: text(/divan|sofa/i),
  stol: text(/kofe|jurnal|stol|table/i),
  kreslo: text(/kreslo|armchair|chair/i),
  tumba: text(/tumba|televizor|\btv\b|komod/i),
  gilam: text(/gilam|rug|carpet|kovrolin/i),
  shkaf: text(/shkaf|javon|bookcase|stellaj/i),
  karavot: roleIs('bed'),
  tumbochka: roleIs('nightstand'),
  garderob: (c) => WARDROBE_NAME.test(c.name_uz),
  yozuv_stoli: roleIs('desk'),
}

/**
 * A preset's furniture is a living room's. A bedroom takes this set instead, in the preset's style;
 * a children's room a desk too. Kept here, not in the JSON the backend shares.
 */
const BEDROOM_SET: Kind[] = ['karavot', 'tumbochka', 'garderob', 'gilam']
const KIDS_SET: Kind[] = [...BEDROOM_SET, 'yozuv_stoli']

/** A children's piece, by name: the backend's `_KIDS_NAME`. */
const KIDS_NAME = /bolalar|детск|kids/i

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

/**
 * The preset data lives in one JSON shared with the backend (app/data/design_presets.json, kept
 * byte-identical by tests): the AI prompt starts from the same plans.
 */
export const DESIGN_PRESETS = presetData.presets as Preset[]

type Score = [number, number, number, number, number]

/**
 * The catalog piece of this kind that best suits the style, then the room. A piece of the style
 * scores 2, an unstyled one (fits every style) 1, another style 0; the room scores the same way.
 * Style outranks room; a tie keeps catalog order. `styles` may be missing on an old cached catalog.
 * A children's piece comes first in a children's room and last anywhere else.
 */
function pick(
  kind: Kind, catalog: CatalogFurniture[], roomType: string | undefined, used: Set<string>, style: FurnitureStyle,
): CatalogFurniture | undefined {
  let best: CatalogFurniture | undefined
  let bestScore: Score = [-1, -1, -1, -1, -1]
  // The catalog has no children's room or study pieces: those rooms take the bedroom's and the living room's.
  const room = catalogRoomType(roomType)
  for (const c of catalog) {
    // A listing without a 3-D model (a photo-only shop item) cannot be placed in the studio.
    if (!c.glb_url || used.has(c.id) || !KIND_MATCH[kind](c)) continue
    const styles = c.styles ?? []
    const kids = KIDS_NAME.test(c.name_uz)
    const score: Score = [
      kids && roomType !== 'bolalar' ? 0 : 1,
      kids && roomType === 'bolalar' ? 1 : 0,
      KIND_PREFER[kind]?.test(c.name_uz) ? 1 : 0,
      styles.includes(style) ? 2 : styles.length === 0 ? 1 : 0,
      c.room_type === room ? 2 : c.room_type === null ? 1 : 0,
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
  const kinds = roomType === 'bolalar' ? KIDS_SET : roomType === 'yotoqxona' ? BEDROOM_SET : preset.furniture.map((f) => f.kind)
  for (const kind of kinds) {
    const item = pick(kind, catalog, roomType, used, preset.furnitureStyle)
    if (!item) continue
    used.add(item.id)
    const inferred = inferRole(item.category, item.name_uz)
    // The piece's own role wins only inside the kind's group: a bedside table picked as a TV unit,
    // or a dining table as a coffee table, would stand in a group with no anchor and be dropped.
    const kindRole = KIND_ROLE[kind]
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
