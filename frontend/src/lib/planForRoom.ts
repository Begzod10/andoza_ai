import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import type { RoomGeometry } from '@/store/roomStore'
import { zoneWallIds } from '@/lib/aiDesignLayout'
import {
  bathroomLights, bathroomWalls, DESIGN_PRESETS, presetPlan, roomSizeOf, WET_FLOOR, WET_ROOMS, type RoomSize,
} from '@/lib/aiDesignPresets'

/**
 * What a design applied to the whole apartment starts from: a ready-made style, or the AI plan made
 * for one room (the source), with that room's wall ids, in order.
 */
export type DesignSource = { kind: 'preset'; id: string } | { kind: 'ai'; plan: AiDesignPlan; wallIds: string[] }

/** Another room of the apartment: its walls in order and its type (`effectiveRoomType`, else 'mehmonxona'). */
export interface TargetRoom {
  geometry: RoomGeometry
  wallIds: string[]
  roomType: string
  /** The room's size; `roomSizeOf(geometry)` when not given. */
  size?: RoomSize
}

/** The style a room type takes when nothing else names one. A type not here takes the living room's. */
const ROOM_DEFAULT_STYLE: Partial<Record<string, string>> = {
  mehmonxona: 'zamonaviy', oshxona: 'zamonaviy',
  yotoqxona: 'skandinav', bolalar: 'skandinav', balkon: 'skandinav',
  kabinet: 'minimalist', hammom: 'minimalist',
}
const defaultStyle = (roomType: string) => ROOM_DEFAULT_STYLE[roomType] ?? 'zamonaviy'

/** A dry room's floor when the plan's is tile: tile belongs in a kitchen or a bathroom. */
const DRY_FLOOR: NonNullable<AiDesignPlan['floor']> = { type: 'laminate', pattern: null, tint: null }

/** The preset for a furniture style, as the backend's `preset_for_style`: the one of that id, else the first of that style. */
function presetForStyle(style: string): string | undefined {
  return (DESIGN_PRESETS.find((p) => p.id === style) ?? DESIGN_PRESETS.find((p) => p.furnitureStyle === style))?.id
}

/**
 * The ready-made style an AI plan stands for: the one it started from (`plan.style`); else the style
 * most of its furniture has in the catalog (a tie goes to the style met first), as a preset; else the
 * room type's default.
 */
export function styleOfPlan(plan: AiDesignPlan, catalog: CatalogFurniture[], roomType: string): string {
  if (plan.style) return plan.style
  const counts = new Map<string, number>()
  for (const f of plan.furniture) {
    for (const s of catalog.find((c) => c.id === f.id)?.styles ?? []) counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  let best: string | undefined
  for (const [style, n] of counts) if (best === undefined || n > counts.get(best)!) best = style
  return (best && presetForStyle(best)) || defaultStyle(roomType)
}

/**
 * A zone of the source room in the target room, by wall position: the source's wall `i` is the
 * target's wall `i % n` (`resolveWalls`' rule). A corner whose two walls become one is that wall. A zone
 * naming a wall the source does not have, of no known spelling, or in a room with no walls, is the centre.
 */
function remapZone(zone: string, from: string[], to: string[]): string {
  const ids = zoneWallIds(zone)
  if (!ids || ids.length === 0 || to.length === 0) return 'center'
  const mapped = ids.map((id) => from.indexOf(id)).map((i) => (i < 0 ? undefined : to[i % to.length]))
  if (mapped.some((id) => id === undefined)) return 'center'
  const [a, b] = mapped
  return b === undefined || a === b ? `wall_${a}` : `corner_${a}_${b}`
}

/**
 * The plan for another room of the apartment.
 *
 * A ready-made style is `presetPlan` for that room: its room set, a wet room's tile floor and the
 * bathroom rules are in it already.
 *
 * An AI plan gives the room its walls, floor, ceiling, skirting and cornice, and its lights' types;
 * the accent wall and the lights on a wall or a corner move by wall position (`remapZone`). The
 * furniture is the plan's style (`styleOfPlan`) for this room type, from `presetPlan`: the AI chose its
 * pieces for the source room. Then the room rules: a kitchen or a bathroom takes a tile floor, a dry
 * room takes laminate for a tile one, and a bathroom no wallpaper (`bathroomWalls`) and no
 * chandelier, pendant or floor lamp (`bathroomLights`).
 *
 * The title and the summary are the style's for this room (`presetPlan`): the AI's describe the source
 * room, its furniture above all. The source's warnings and notes stay with the source.
 */
export function planForRoom(source: DesignSource, target: TargetRoom, catalog: CatalogFurniture[]): AiDesignPlan {
  const size = target.size ?? roomSizeOf(target.geometry)
  const { roomType, wallIds } = target
  if (source.kind === 'preset') {
    const plan = presetPlan(source.id, catalog, roomType, wallIds, size)
    if (!plan) throw new Error(`Unknown design preset: ${source.id}`)
    return plan
  }
  const { plan } = source
  const named = styleOfPlan(plan, catalog, roomType)
  const style = presetForStyle(named) ?? defaultStyle(roomType)
  const preset = presetPlan(style, catalog, roomType, wallIds, size)!

  const bathroom = roomType === 'hammom'
  const { accent, ...rest } = bathroom ? bathroomWalls(plan.walls) : plan.walls
  const accentZone = accent && remapZone(`wall_${accent.wall}`, source.wallIds, wallIds)
  const walls: AiDesignPlan['walls'] = {
    ...rest,
    ...(accent && accentZone?.startsWith('wall_') ? { accent: { ...accent, wall: accentZone.slice(5) } } : {}),
  }
  const floor = WET_ROOMS.has(roomType) ? WET_FLOOR : plan.floor?.type === 'tile' ? DRY_FLOOR : plan.floor
  const moved = plan.lights.map((l) => ({ ...l, zone: remapZone(l.zone, source.wallIds, wallIds) }))

  return {
    title: preset.title, summary: preset.summary,
    walls, floor, lights: bathroom ? bathroomLights(moved) : moved,
    furniture: preset.furniture,
    ...(plan.trim !== undefined ? { trim: plan.trim } : {}),
    warnings: [], style,
  }
}
