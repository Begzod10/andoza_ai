import type { AiDesignPlan, CatalogFurniture, DesignTrim } from '@/lib/api'
import type { FurnitureStyle } from '@/lib/furnitureStyles'
import { inferRole, ROLE_GROUP, WARDROBE_NAME, type FurnitureRole } from '@/lib/furnitureRole'
import { catalogRoomType } from '@/lib/roomType'
import type { RoomGeometry } from '@/store/roomStore'
import i18n, { type TKey } from '@/i18n'
import presetData from '@/lib/data/design_presets.json'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { SENTENCE_END, WORD_START } from '@/lib/aiSummary'

/**
 * Ready-made styles: the same kind of plan the AI designer makes, written by hand, so a style
 * can be applied at once, free, and when the AI is not answering.
 *
 * A preset names the KIND of furniture it wants ("a sofa against wall C"), not a catalog id: the
 * catalog differs from shop to shop. `presetPlan` finds the pieces in the catalog that is loaded.
 * A kind with no match is left out rather than guessed.
 */

type Kind =
  | 'divan' | 'stol' | 'kreslo' | 'tumba' | 'gilam' | 'shkaf' | 'karavot' | 'tumbochka' | 'garderob' | 'yozuv_stoli'
  | 'ovqat_stoli' | 'stul' | 'oshxona_shkafi' | 'ish_stuli' | 'javon' | 'kichik_stol' | 'orindiq' | 'hammom_shkafi' | 'kabinet_kreslo'

/**
 * The role a kind plays when the catalog piece itself says nothing more (its name and category
 * infer only decor). A "stol" may be a dining table: the piece's own role comes first.
 */
const KIND_ROLE: Record<Kind, FurnitureRole> = {
  divan: 'sofa', stol: 'coffee_table', kreslo: 'armchair', tumba: 'tv_unit', gilam: 'rug', shkaf: 'shelf',
  karavot: 'bed', tumbochka: 'nightstand', garderob: 'wardrobe', yozuv_stoli: 'desk',
  ovqat_stoli: 'dining_table', stul: 'dining_chair', oshxona_shkafi: 'shelf', ish_stuli: 'desk_chair', javon: 'shelf',
  kichik_stol: 'coffee_table', orindiq: 'armchair', hammom_shkafi: 'shelf', kabinet_kreslo: 'armchair',
}

/**
 * Kinds whose own role always wins: a kitchen or bath cabinet is a shelf, never the wardrobe its
 * "shkaf" reads as, or a layout too small for it would swap in a clothes wardrobe.
 */
const KIND_ROLE_WINS: ReadonlySet<Kind> = new Set<Kind>(['oshxona_shkafi', 'hammom_shkafi'])

const text = (pattern: RegExp) => (c: CatalogFurniture) => pattern.test(`${c.category} ${c.name_uz}`)
const roleIs = (role: FurnitureRole) => (c: CatalogFurniture) => inferRole(c.category, c.name_uz) === role
/** A cupboard of any kind (`inferRole` reads a "shkaf" as a wardrobe, a "javon" as a shelf). */
const storage = (c: CatalogFurniture) => ROLE_GROUP[inferRole(c.category, c.name_uz)] === 'storage'
/** A bookcase named as a book cupboard, which `inferRole` reads as a wardrobe. */
const BOOKCASE_NAME = /kitob|книжн|bookcase/i
/** A side table: `inferRole` has no role for one (its category makes it a dining table). */
const SIDE_TABLE_NAME = /yon stol|side table|приставн/i

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
  // A side table reads as a dining table to `inferRole` (its category), but seats no one.
  ovqat_stoli: (c) => roleIs('dining_table')(c) && !SIDE_TABLE_NAME.test(c.name_uz),
  stul: roleIs('dining_chair'),
  // Only a cupboard the catalog made for a kitchen: a bookcase or a wardrobe is not one.
  oshxona_shkafi: (c) => c.room_type === 'oshxona' && storage(c),
  ish_stuli: roleIs('desk_chair'),
  javon: (c) => roleIs('shelf')(c) || (BOOKCASE_NAME.test(c.name_uz) && !WARDROBE_NAME.test(c.name_uz) && storage(c)),
  kichik_stol: (c) => roleIs('coffee_table')(c) || SIDE_TABLE_NAME.test(c.name_uz),
  orindiq: (c) => roleIs('armchair')(c) || roleIs('dining_chair')(c),
  // A bath or mirror cabinet: a cupboard the catalog made for a bathroom.
  hammom_shkafi: (c) => c.room_type === 'hammom' && storage(c),
  // A study's armchair: `kreslo` also matches an office chair ("Kreslo-kompyuter", "Office chair").
  kabinet_kreslo: roleIs('armchair'),
}

/**
 * A preset's furniture is a living room's. Another room takes its own set instead (`ROOM_SETS`), in
 * the preset's style: a bedroom this one, a children's room a desk too. Kept here, not in the JSON
 * the backend shares.
 */
const BEDROOM_SET: Kind[] = ['karavot', 'tumbochka', 'garderob', 'gilam']
const KIDS_SET: Kind[] = [...BEDROOM_SET, 'yozuv_stoli']
/**
 * A kitchen: a dining table and its chairs (one plan line: the layout seats as many as the table
 * takes, and `sizeFit` puts a table for four first), and a kitchen cabinet when the catalog has one.
 */
const KITCHEN_SET: Kind[] = ['ovqat_stoli', 'stul', 'oshxona_shkafi']
const STUDY_SET: Kind[] = ['yozuv_stoli', 'ish_stuli', 'javon', 'kabinet_kreslo']
/**
 * A balcony: a small table and two seats (two pieces: a seat is never taken twice). The catalog does
 * have a balcony room (`room_type` 'balkon', as the backend's admin catalog allows), so a balcony's
 * catalog room stays its own, as in the AI designer; a piece made for another room still fills it.
 */
const BALCONY_SET: Kind[] = ['kichik_stol', 'orindiq', 'orindiq']
/** A bathroom: nothing but a bath cabinet, and only one made for a bathroom. */
const BATHROOM_SET: Kind[] = ['hammom_shkafi']

/** The set a room type takes instead of the preset's living room. A room type not here keeps the preset's. */
const ROOM_SETS: Partial<Record<string, Kind[]>> = {
  yotoqxona: BEDROOM_SET, bolalar: KIDS_SET, oshxona: KITCHEN_SET, kabinet: STUDY_SET, balkon: BALCONY_SET, hammom: BATHROOM_SET,
}

/** A kitchen and a bathroom get a tile floor whatever the style: the backend's wet-room rule. */
const WET_ROOMS = new Set(['oshxona', 'hammom'])
const WET_FLOOR: NonNullable<AiDesignPlan['floor']> = { type: 'tile', pattern: null, tint: null }

/**
 * A bathroom's walls and lights. Wallpaper does not take the damp: an oboy wall is painted in the
 * wallpaper's base colour. A chandelier, a pendant or a floor lamp has no place there: one in the
 * centre gives way to the preset's other ceiling light (an LED line, a track, a spot), else a
 * downlight; a floor lamp goes. A wall lamp is kept only as the studio's moisture-proof bath light,
 * and only one (it hangs over the mirror): a bra becomes it, at the first bra's wall.
 */
const NOT_IN_BATHROOM = new Set(['chandelier', 'pendant', 'floor_lamp'])
const BATH_CENTRE = 'downlight'
const mountOf = (type: string) => LIGHT_TYPES.find((t) => t.id === type)?.mount

function bathroomWalls(walls: AiDesignPlan['walls']): AiDesignPlan['walls'] {
  const main = walls.main
  return main?.type === 'oboy' ? { ...walls, main: { type: 'paint', color: main.base_color } } : walls
}

function bathroomLights(lights: AiDesignPlan['lights']): AiDesignPlan['lights'] {
  const ceiling = (type: string) => !NOT_IN_BATHROOM.has(type) && ['ceiling', 'recessed', 'track'].includes(mountOf(type) ?? '')
  const other = lights.find((l) => ceiling(l.type))?.type ?? BATH_CENTRE
  const out: AiDesignPlan['lights'] = []
  for (const l of lights) {
    if (l.type === 'floor_lamp') continue
    if (NOT_IN_BATHROOM.has(l.type)) out.push({ type: l.zone === 'center' ? other : BATH_CENTRE, zone: l.zone })
    else if (mountOf(l.type) === 'wall') {
      if (!out.some((o) => o.type === 'bath')) out.push({ type: 'bath', zone: l.zone })
    } else out.push(l)
  }
  // A plan whose only lights were lamps still lights the bathroom from the ceiling.
  if (!out.some((l) => ceiling(l.type))) out.unshift({ type: BATH_CENTRE, zone: 'center' })
  return out
}

/**
 * The words a preset's summary uses, in uz, ru and en, for what a kitchen or a bathroom takes out:
 * the summary is read in the language the style is applied in. Word starts, so an ending is matched
 * too ("parketli", "паркетом", "люстрой").
 */
const APOS = "['ʻʼ‘’`]"
const FLOOR_WORDS = [
  'parket', 'laminat', 'beton', `yog${APOS}och\\p{L}* pol`, 'yelkan', 'herringbone',
  'паркет', 'ламинат', 'бетон', 'деревянн\\p{L}* пол', 'ёлочк', 'елочк',
  'parquet', 'laminate', 'concrete', 'wood\\p{L}* floor',
]
const BATH_WORDS = [
  'oboy', 'qandil', `osma chiroq`, 'torsher',
  'обо(?:и|ев|ям|ями|ях)(?!\\p{L})', 'люстр', 'подвесн', 'торшер',
  'wallpaper', 'chandelier', 'pendant', 'floor lamp',
]
const wordsRe = (words: string[]) => new RegExp(`${WORD_START}(?:${words.join('|')})`, 'iu')
const FLOOR_RE = wordsRe(FLOOR_WORDS)
const BATH_RE = wordsRe(BATH_WORDS)

/**
 * The preset's summary for a kitchen or a bathroom: the sentences naming what `presetPlan` took out
 * go (a wood or concrete floor; in a bathroom also wallpaper, a chandelier, a pendant, a floor lamp),
 * and a sentence for what it put in comes after. When none of the preset's own sentences is left,
 * a first one names the style and the room, so the summary still says what was applied: the style's
 * label, not its title, which may name the very floor taken out ("Loft: beton va g'isht"). The room's
 * name is lowercased, as it stands mid-sentence. Any other room keeps the summary as written.
 */
function roomSummary(summary: string, roomType: string | undefined, labelKey: TKey): string {
  if (!roomType || !WET_ROOMS.has(roomType)) return summary
  const bathroom = roomType === 'hammom'
  const kept = summary.trim().split(SENTENCE_END).filter((s) => !FLOOR_RE.test(s) && !(bathroom && BATH_RE.test(s)))
  const room = i18n.t(`rooms.type.${roomType}` as TKey).toLocaleLowerCase(i18n.language)
  const adapted = kept.length === 0 ? [i18n.t('studio.lib.presetRoom.adapted', { style: i18n.t(labelKey), room })] : []
  const added = [i18n.t('studio.lib.presetRoom.floor'), ...(bathroom ? [i18n.t('studio.lib.presetRoom.bathroom')] : [])]
  return [...adapted, ...kept, ...added].join(' ')
}

/** A children's piece, by name: the backend's `_KIDS_NAME`. */
const KIDS_NAME = /bolalar|детск|kids/i

/**
 * Names that make the best piece of a kind, tried before the generic KIND_MATCH: a TV stand rather
 * than a bedside "tumbochka", a coffee table rather than a dining or writing table.
 */
const KIND_PREFER: Partial<Record<Kind, RegExp>> = {
  tumba: /^(?!.*tumbochka).*(tumba|televizor|\btv\b)/i,
  stol: /kofe|jurnal|coffee/i,
  javon: /kitob|книжн|bookcase|javon|stellaj/i,
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

type Score = [number, number, number, number, number, number, number]

/** A room's floor area, m2, and its shorter side, metres: what the backend tells the AI. */
export interface RoomSize { area: number; minSide: number }

/**
 * The room's size the way the backend's `_room_summary` reads it: the area of its outline (a scan
 * turned 45 degrees or an L-shaped room has a bounding box far larger than its floor), else width by
 * depth; the sides are walls A and B, else the first two walls. Undefined when the walls have no length.
 */
export function roomSizeOf(geometry: RoomGeometry): RoomSize | undefined {
  const { walls, vertices } = geometry
  const lengthOf = (id: string, at: number) => (walls.find((w) => w.id === id)?.length || walls[at]?.length || 0) / 1000
  const w = lengthOf('A', 0), d = lengthOf('B', 1)
  if (!(w > 0 && d > 0)) return undefined
  // Shoelace, mm2 to m2.
  const shoelace = vertices && vertices.length >= 3
    ? Math.abs(vertices.reduce((sum, [x1, z1], i) => {
      const [x2, z2] = vertices[(i + 1) % vertices.length]
      return sum + x1 * z2 - x2 * z1
    }, 0)) / 2 / 1e6
    : 0
  return { area: shoelace || w * d, minSide: Math.min(w, d) }
}

/**
 * A bedroom this small takes a single bed: under 10 m2, or under 2.6 m across. The backend's
 * `_is_small_bedroom`, which tells the AI the same.
 */
const SMALL_ROOM_AREA = 10
const SMALL_ROOM_SIDE = 2.6
/** A double bed is this wide or wider, a single one this narrow or narrower, cm. */
const DOUBLE_BED_W = 140
const SINGLE_BED_W = 120
/** A dining table this long or longer seats six (`chairCount`), cm: a kitchen set seats four. */
const SIX_SEAT_TABLE = 160
/**
 * A balcony narrower than this takes one seat, not two, and the smallest small table: on the eval's
 * 3 x 1.4 m balcony a second armchair beside a 110 x 60 table was left out in most styles, metres.
 */
const NARROW_BALCONY = 1.8
const narrowBalcony = (roomType: string | undefined, size: RoomSize | undefined) =>
  roomType === 'balkon' && size !== undefined && size.minSide < NARROW_BALCONY

/**
 * How well a bed suits the room's size: 2 for a double bed in a normal room or a single one in a small
 * room, 1 for one in between (121-139 cm), 0 for the other kind. Any other kind, an unknown room or a
 * bed of unknown width scores 2, so it is never put behind a bed that fits: the order is as before.
 * A dining table and a narrow balcony's small table are scored by their size too.
 */
function sizeFit(kind: Kind, c: CatalogFurniture, size: RoomSize | undefined, roomType: string | undefined): number {
  // On a narrow balcony the smallest table first, by its footprint (one with none last).
  if (kind === 'kichik_stol' && narrowBalcony(roomType, size)) {
    return c.footprint_w && c.footprint_d ? -(c.footprint_w * c.footprint_d) : -Infinity
  }
  if (kind === 'ovqat_stoli') {
    // Up to four chairs: a table seating six comes after one seating four or fewer.
    const long = Math.max(c.footprint_w ?? 0, c.footprint_d ?? 0)
    return long >= SIX_SEAT_TABLE ? 1 : 2
  }
  if (kind !== 'karavot' || !size || c.footprint_w == null) return 2
  // A mattress is never wider than it is long, and the catalog stores some beds turned (200 x 90).
  const width = c.footprint_d == null ? c.footprint_w : Math.min(c.footprint_w, c.footprint_d)
  const small = size.area < SMALL_ROOM_AREA || size.minSide < SMALL_ROOM_SIDE
  if (width > SINGLE_BED_W && width < DOUBLE_BED_W) return 1
  return (small ? width <= SINGLE_BED_W : width >= DOUBLE_BED_W) ? 2 : 0
}

/**
 * The catalog piece of this kind that best suits the style, then the room. A piece of the style
 * scores 2, an unstyled one (fits every style) 1, another style 0; the room scores the same way.
 * Style outranks room, but a piece made for another room (a kitchen cabinet in a living room) comes
 * after every piece for this room or any room: it is used only when nothing else fits. The kind's
 * preferred name (KIND_PREFER) comes before even that: a living room takes a coffee table made for the
 * kitchen over a dining table made for it, for a preset's coffee table. A tie keeps catalog order. `styles` may be missing on an old cached catalog.
 * A children's piece comes first in a children's room and last anywhere else. A bed that suits the room's
 * size (`sizeFit`) comes before the style: a 90 cm bed of no style must not take a 4 x 3.5 m bedroom; a
 * kitchen's table for four comes before a larger one; a narrow balcony's smallest small table first.
 */
function pick(
  kind: Kind, catalog: CatalogFurniture[], roomType: string | undefined, used: Set<string>, style: FurnitureStyle,
  roomSize: RoomSize | undefined,
): CatalogFurniture | undefined {
  let best: CatalogFurniture | undefined
  let bestScore: Score = [-1, -1, -1, -1, -1, -1, -1]
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
      room === undefined || c.room_type === null || c.room_type === room ? 1 : 0,
      sizeFit(kind, c, roomSize, roomType),
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

/**
 * The plan for a preset with its furniture taken from `catalog`. Undefined for an unknown id.
 * `roomSize` (`roomSizeOf`) picks a bed that fits the room, and gives a balcony under 1.8 m across one
 * seat and the smallest small table; without it these are picked as any piece.
 */
export function presetPlan(
  id: string, catalog: CatalogFurniture[], roomType?: string, wallIds: string[] = ['A', 'B', 'C', 'D'],
  roomSize?: RoomSize,
): AiDesignPlan | undefined {
  const preset = DESIGN_PRESETS.find((p) => p.id === id)
  if (!preset) return undefined
  const used = new Set<string>()
  const furniture: AiDesignPlan['furniture'] = []
  const set = ROOM_SETS[roomType ?? '']
  // A narrow balcony has room for one seat by its table.
  const kinds = set && narrowBalcony(roomType, roomSize) ? set.filter((k, i) => k !== 'orindiq' || set.indexOf(k) === i)
    : set ?? preset.furniture.map((f) => f.kind)
  for (const kind of kinds) {
    const item = pick(kind, catalog, roomType, used, preset.furnitureStyle, roomSize)
    if (!item) continue
    used.add(item.id)
    const inferred = inferRole(item.category, item.name_uz)
    // The piece's own role wins only inside the kind's group: a bedside table picked as a TV unit,
    // or a dining table as a coffee table, would stand in a group with no anchor and be dropped.
    const kindRole = KIND_ROLE[kind]
    const role = !KIND_ROLE_WINS.has(kind) && ROLE_GROUP[inferred] === ROLE_GROUP[kindRole] && inferred !== 'decor' ? inferred : kindRole
    furniture.push({ id: item.id, name: item.name_uz, role })
  }
  const accent = preset.walls.accent
  const bathroom = roomType === 'hammom'
  const walls = bathroom ? bathroomWalls(preset.walls) : preset.walls
  const lights = bathroom ? bathroomLights(preset.lights) : preset.lights
  return {
    title: i18n.t(preset.titleKey), summary: roomSummary(i18n.t(preset.summaryKey), roomType, preset.labelKey),
    walls: {
      ...walls,
      ...(accent ? { accent: { ...accent, wall: resolveWalls(`wall_${accent.wall}`, wallIds).slice(5) } } : {}),
    },
    floor: roomType && WET_ROOMS.has(roomType) ? WET_FLOOR : preset.floor,
    lights: lights.map((l) => ({ ...l, zone: resolveWalls(l.zone, wallIds) })),
    furniture, trim: preset.trim, warnings: [],
  }
}
