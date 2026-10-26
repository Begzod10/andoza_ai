import { nanoid } from 'nanoid'
import type { TFunction } from 'i18next'
import type { AiDesignPlan } from '@/lib/api'
import type { CatalogFurniture } from '@/lib/api'
import { useRoomStore } from '@/store/roomStore'
import type { DesignState, PlacedFurniture, PlacedLight } from '@/store/roomStore'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import type { FloorPatternId } from '@/lib/floorGeometry'
import { lightType } from '@/lib/lightCatalog'
import type { LightTypeId } from '@/lib/lightCatalog'
import { floorLampSpot, lightSpot, roomModel, type Rect } from '@/lib/aiDesignLayout'
import type { Piece } from '@/lib/furnitureGroups'
import { layoutFurniture } from '@/lib/furnitureLayout'
import { WARDROBE_NAME, inferRole, isRole, type FurnitureRole } from '@/lib/furnitureRole'
import { catalogRoomType } from '@/lib/roomType'

/** Which parts of a plan to apply. Everything is on by default; the reader may switch parts off. */
export interface DesignParts { walls: boolean; floor: boolean; lights: boolean; furniture: boolean }
export const ALL_PARTS: DesignParts = { walls: true, floor: true, lights: true, furniture: true }

/** The room as it was, to put back. */
export interface DesignSnapshot {
  designState: DesignState
  lights: PlacedLight[]
  furniture: PlacedFurniture[]
}

export function snapshotDesign(): DesignSnapshot {
  const s = useRoomStore.getState()
  return structuredClone({ designState: s.designState, lights: s.lights, furniture: s.furniture })
}

export function restoreDesign(snapshot: DesignSnapshot): void {
  useRoomStore.setState({
    designState: snapshot.designState,
    lights: snapshot.lights,
    furniture: snapshot.furniture,
    isDirty: true,
  })
}

export interface AppliedCounts { walls: boolean; floor: boolean; lights: number; furniture: number
  /** Pieces left out because there was no clean place for them (the total of `dropped`). */
  skipped: number
  /** What was left out, by name, with how many. */
  dropped: Array<{ name: string; count: number }>
  /** What was put in the room, by name (a stand-in by its own), with how many: chairs round a table count each. */
  placed: Array<{ name: string; count: number }>
  /** The pieces that did not fit and were swapped for a smaller one of their kind. */
  swapped: Array<{ from: string; to: string }> }

const FALLBACK_SIZE = { w: 0.9, d: 0.7 }

/** A catalog category that is a floor covering: such a piece is a rug whatever its name or the plan says. */
const RUG_CATEGORY = /gilam|rug|carpet|kovrolin/i

/** A plan piece's role: a rug by its catalog category, else the plan's own role when it is a known one, else from its category and name. */
function roleOf(p: AiDesignPlan['furniture'][number], item: CatalogFurniture | undefined): FurnitureRole {
  if (item && RUG_CATEGORY.test(item.category)) return 'rug'
  return isRole(p.role) ? p.role : inferRole(item?.category, p.name)
}

/** Pieces that stand tall: they would shut out a window. (Wall-hung pieces count too, see tallOf.) */
const TALL_PIECES = /shkaf|garderob|vitrina|stellaj|kitob|javon|pianino|bufet|komod|wardrobe|bookcase|cabinet/i

/** A piece at least this tall reaches a window's sill, so it stands in front of the glass (centimetres). */
const SILL_CM = 90

/**
 * Would this piece stand in the light of a window? One hung on the wall does. Otherwise its measured
 * height decides when the catalog has it (models uploaded since heights were measured); the older ones,
 * with no height, are judged by what they are called.
 */
function tallOf(item: CatalogFurniture | undefined): boolean {
  if (!item) return false
  if (item.placement === 'devor') return true
  if (item.height_cm != null && item.height_cm > 0) return item.height_cm >= SILL_CM
  return TALL_PIECES.test(`${item.category} ${item.name_uz}`)
}

/** A catalog item's footprint in metres (the catalog stores centimetres), and whether it is tall. */
function sizeOf(item: CatalogFurniture | undefined): { w: number; d: number; tall: boolean } {
  const tall = tallOf(item)
  return item?.footprint_w && item.footprint_d ? { w: item.footprint_w / 100, d: item.footprint_d / 100, tall } : { ...FALLBACK_SIZE, tall }
}

/** The main pieces that, when they do not fit, are tried again as a smaller one of their kind. */
const SWAP_ROLES: FurnitureRole[] = ['bed', 'wardrobe', 'sofa']
/** How many smaller pieces are tried for each one left out: each try lays out the whole room again. */
const SWAP_TRIES = 5

type Layout = ReturnType<typeof layoutFurniture>

/** A children's piece, by name: the backend's `_KIDS_NAME`. */
const KIDS_NAME = /bolalar|детск|kids/i

/**
 * The catalog's pieces that could stand in for `piece`: the same role (for a wardrobe, one named as a
 * wardrobe for clothes), a 3-D model, a smaller footprint, standing on the floor and made for this
 * room (or for every room; with no room type, any); a children's piece only in a children's room. Those sharing a style with it come first (an
 * unstyled piece suits every style), then the largest, so a double bed gives way to the next size
 * down, not a cot; among those, ones made for this very room before ones for every room.
 */
function smallerOfKind(piece: Piece, catalog: CatalogFurniture[], roomType?: string): CatalogFurniture[] {
  const styles = catalog.find((c) => c.id === piece.id)?.styles ?? []
  const room = catalogRoomType(roomType)
  const area = (c: CatalogFurniture) => (c.footprint_w ?? 0) * (c.footprint_d ?? 0) / 1e4
  const sameStyle = (c: CatalogFurniture) => styles.length === 0 || !c.styles?.length || c.styles.some((s) => styles.includes(s))
  return catalog
    .filter((c) => c.glb_url && c.id !== piece.id && c.footprint_w && c.footprint_d && area(c) < piece.w * piece.d - 1e-9
      && c.placement === 'pol' && (room === undefined || c.room_type === null || c.room_type === room)
      && (roomType === 'bolalar' || !KIDS_NAME.test(c.name_uz))
      && (piece.role === 'wardrobe' ? WARDROBE_NAME.test(c.name_uz) : roleOf({ id: c.id, name: c.name_uz }, c) === piece.role))
    .sort((a, b) => Number(sameStyle(b)) - Number(sameStyle(a)) || area(b) - area(a)
      || Number(b.room_type !== null) - Number(a.room_type !== null))
}

/**
 * The layout, with each main piece it left out (a bed, wardrobe or sofa too big for the room)
 * swapped for a smaller one of its kind from the catalog: the first that is placed with the room's
 * pieces worth more overall (`weight`: the room's main piece outweighs all the rest, and in a bedroom a
 * wardrobe outweighs a nightstand) is kept. A piece with no such stand-in stays left out.
 */
function layoutWithSwaps(
  pieces: Piece[], catalog: CatalogFurniture[], roomType: string | undefined, layout: (ps: Piece[]) => Layout,
): Layout & { swapped: AppliedCounts['swapped'] } {
  let current = pieces
  let best = layout(current)
  const swapped: AppliedCounts['swapped'] = []
  for (let i = 0; i < current.length; i++) {
    const piece = current[i]
    if (!SWAP_ROLES.includes(piece.role) || best.placed.some((p) => p.piece === piece)) continue
    for (const c of smallerOfKind(piece, catalog, roomType).slice(0, SWAP_TRIES)) {
      const swap: Piece = { id: c.id, name: c.name_uz, role: piece.role, ...sizeOf(c) }
      const trial = current.map((p, k) => (k === i ? swap : p))
      const next = layout(trial)
      if (next.placed.some((p) => p.piece === swap) && next.weight > best.weight) {
        current = trial
        best = next
        swapped.push({ from: piece.name, to: swap.name })
        break
      }
    }
  }
  return { ...best, swapped }
}

/**
 * Puts the chosen parts of a plan into the room, on top of what is there: the wall finish and the
 * floor are replaced, and an earlier design's lights and furniture are replaced: the user's own
 * stay, and new pieces avoid them. Furniture is laid out in groups (`layoutFurniture`), the room's
 * main group, from `roomType`, first. Returns what was applied; `restoreDesign(snapshot)` undoes it.
 */
export function applyDesignPlan(plan: AiDesignPlan, parts: DesignParts, catalog: CatalogFurniture[], roomType?: string): AppliedCounts {
  const store = useRoomStore.getState()
  const applied: AppliedCounts = { walls: false, floor: false, lights: 0, furniture: 0, skipped: 0, dropped: [], placed: [], swapped: [] }

  if (parts.walls && plan.walls.main) {
    const main = plan.walls.main
    store.setWallCovering(
      'ALL',
      main.type === 'paint'
        ? { kind: 'paint', color: main.color }
        : { kind: 'oboy', patternId: main.pattern, baseColor: main.base_color, accentColor: main.accent_color },
    )
    if (plan.walls.accent) store.setWallCovering(plan.walls.accent.wall, { kind: 'paint', color: plan.walls.accent.color })
    if (plan.trim) {
      // Only the parts the plan names: an AI plan may leave out the ceiling or the skirting.
      const { skirting, cornice } = plan.trim
      let { ceiling } = plan.trim
      // An AI plan keeping the room's ceiling design sends no settings: the user's own stay.
      const current = useRoomStore.getState().designState.ceiling
      if (ceiling && !ceiling.settings && current?.design === ceiling.design) ceiling = current
      store.setDesignState({
        ...(ceiling && { ceiling }),
        ...(skirting && { skirting }),
        ...(cornice !== undefined && { cornice }),
      })
    }
    applied.walls = true
  }

  if (parts.floor && plan.floor) {
    const known = FLOOR_PATTERN_DEFS.some((d) => d.id === plan.floor!.pattern)
    store.setDesignState({
      floorType: plan.floor.type as DesignState['floorType'],
      floorConfigured: true,
      floorTexture: null,
      floorPattern:
        known && plan.floor.pattern
          ? { id: plan.floor.pattern as FloorPatternId, settings: plan.floor.tint ? { baseColor: plan.floor.tint } : {} }
          : null,
    })
    applied.floor = true
  }

  const geometry = useRoomStore.getState().geometry
  const model = roomModel(geometry)

  if (parts.furniture) {
    // An earlier design's pieces go before the new ones are placed, so they neither stay nor
    // crowd the new ones out; the user's own stay, and the new ones avoid them.
    for (const f of useRoomStore.getState().furniture) if (f.fromDesign) store.removeFurniture(f.id)
    const byId = new Map(catalog.map((c) => [c.id, c]))
    const taken: Rect[] = useRoomStore.getState().furniture.map((f) => {
      const size = sizeOf(byId.get(f.furniture_id))
      return { x: f.x / 1000, z: f.y / 1000, w: size.w, d: size.d, rotation: f.rotation }
    })
    const pieces: Piece[] = plan.furniture.map((p) => {
      const item = byId.get(p.id)
      return { id: p.id, name: p.name, role: roleOf(p, item), ...sizeOf(item) }
    })
    const { placed, dropped, swapped } = layoutWithSwaps(pieces, catalog, roomType, (ps) => layoutFurniture(ps, model, roomType, taken))
    // Each placed piece is its own entry, chairs round a table too (they share one plan line).
    for (const { piece, rect } of placed) {
      store.placeFurniture({
        id: nanoid(), furniture_id: piece.id, x: rect.x * 1000, y: rect.z * 1000, rotation: rect.rotation, fromDesign: true,
      })
    }
    applied.furniture = placed.length
    applied.dropped = dropped
    applied.swapped = swapped
    const times = new Map<string, number>()
    for (const { piece } of placed) times.set(piece.name, (times.get(piece.name) ?? 0) + 1)
    applied.placed = [...times].map(([name, count]) => ({ name, count }))
    applied.skipped = dropped.reduce((s, d) => s + d.count, 0)
  }

  // After the furniture, so a floor lamp can keep off it: the design's pieces and the user's own.
  if (parts.lights) {
    // An earlier design's lights go; the user's own stay (and new ones are added beside them).
    for (const l of useRoomStore.getState().lights) if (l.fromDesign) store.removeLight(l.id)
    const byId = new Map(catalog.map((c) => [c.id, c]))
    // A rug lies under things, and a piece hung on the wall is above them: a lamp may stand there.
    const solid: Rect[] = useRoomStore.getState().furniture.flatMap((f) => {
      const item = byId.get(f.furniture_id)
      if (item && (item.placement === 'devor' || RUG_CATEGORY.test(item.category) || inferRole(item.category, item.name_uz) === 'rug')) return []
      const size = sizeOf(item)
      return [{ x: f.x / 1000, z: f.y / 1000, w: size.w, d: size.d, rotation: f.rotation }]
    })
    const nthByZone = new Map<string, number>()
    for (const light of plan.lights) {
      const type = lightType(light.type)
      const key = `${light.zone}:${type.mount === 'wall'}`
      const nth = nthByZone.get(key) ?? 0
      nthByZone.set(key, nth + 1)
      let spot = lightSpot(light.zone, type.mount, model, nth)
      if (type.mount === 'floor' && model.walls.length) {
        const at = { x: (spot.xMm - model.offsetMm.x) / 1000, z: (spot.zMm - model.offsetMm.z) / 1000 }
        const moved = floorLampSpot(at, type.sizeM, light.zone, model, solid)
        spot = { xMm: Math.round(moved.x * 1000 + model.offsetMm.x), zMm: Math.round(moved.z * 1000 + model.offsetMm.z) }
        // The next floor lamp keeps off this one (two in one corner would share its spot).
        solid.push({ x: moved.x, z: moved.z, w: type.sizeM.w, d: type.sizeM.d, rotation: 0 })
      }
      store.addLight({ id: nanoid(), type: type.id as LightTypeId, ...spot, fromDesign: true })
      applied.lights++
    }
  }
  return applied
}

/**
 * The notice line naming what did not fit ("Joy yetmadi: Ovqat stoli, 4 ta stul qo'yilmadi."), or
 * empty when everything did. Built with `t` when the design is applied.
 */
export function droppedNotice(dropped: AppliedCounts['dropped'], t: TFunction): string {
  if (dropped.length === 0) return ''
  const list = dropped.map(({ name, count }) => t('ai.dropped_item', { name, count })).join(', ')
  return t('ai.joy_yetmadi', { list })
}
