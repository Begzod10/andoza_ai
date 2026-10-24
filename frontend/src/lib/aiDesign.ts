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
import { lightSpot, roomModel, type Rect } from '@/lib/aiDesignLayout'
import type { Piece } from '@/lib/furnitureGroups'
import { layoutFurniture } from '@/lib/furnitureLayout'
import { inferRole } from '@/lib/furnitureRole'

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
  dropped: Array<{ name: string; count: number }> }

const FALLBACK_SIZE = { w: 0.9, d: 0.7 }

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

/**
 * Puts the chosen parts of a plan into the room, on top of what is there: the wall finish and the
 * floor are replaced, and an earlier design's lights and furniture are replaced: the user's own
 * stay, and new pieces avoid them. Furniture is laid out in groups (`layoutFurniture`), the room's
 * main group, from `roomType`, first. Returns what was applied; `restoreDesign(snapshot)` undoes it.
 */
export function applyDesignPlan(plan: AiDesignPlan, parts: DesignParts, catalog: CatalogFurniture[], roomType?: string): AppliedCounts {
  const store = useRoomStore.getState()
  const applied: AppliedCounts = { walls: false, floor: false, lights: 0, furniture: 0, skipped: 0, dropped: [] }

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
      const { ceiling, skirting, cornice } = plan.trim
      store.setDesignState({ ceiling, skirting, cornice })
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

  if (parts.lights) {
    // An earlier design's lights go; the user's own stay (and new ones are added beside them).
    for (const l of useRoomStore.getState().lights) if (l.fromDesign) store.removeLight(l.id)
    const nthByZone = new Map<string, number>()
    for (const light of plan.lights) {
      const type = lightType(light.type)
      const key = `${light.zone}:${type.mount === 'wall'}`
      const nth = nthByZone.get(key) ?? 0
      nthByZone.set(key, nth + 1)
      const spot = lightSpot(light.zone, type.mount, model, nth)
      store.addLight({ id: nanoid(), type: type.id as LightTypeId, ...spot, fromDesign: true })
      applied.lights++
    }
  }

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
      return { id: p.id, name: p.name, role: p.role ?? inferRole(item?.category, p.name), ...sizeOf(item) }
    })
    const { placed, dropped } = layoutFurniture(pieces, model, roomType, taken)
    // Each placed piece is its own entry, chairs round a table too (they share one plan line).
    for (const { piece, rect } of placed) {
      store.placeFurniture({
        id: nanoid(), furniture_id: piece.id, x: rect.x * 1000, y: rect.z * 1000, rotation: rect.rotation, fromDesign: true,
      })
    }
    applied.furniture = placed.length
    applied.dropped = dropped
    applied.skipped = dropped.reduce((s, d) => s + d.count, 0)
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
