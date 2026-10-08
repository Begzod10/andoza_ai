import { nanoid } from 'nanoid'
import type { AiDesignPlan } from '@/lib/api'
import type { CatalogFurniture } from '@/lib/api'
import { useRoomStore } from '@/store/roomStore'
import type { DesignState, PlacedFurniture, PlacedLight } from '@/store/roomStore'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import type { FloorPatternId } from '@/lib/floorGeometry'
import { lightType } from '@/lib/lightCatalog'
import type { LightTypeId } from '@/lib/lightCatalog'
import { furnitureSpot, lightSpot, roomModel, type Rect } from '@/lib/aiDesignLayout'

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
  /** Pieces left out because there was no clean place for them (they would block a door or window, or overlap). */
  skipped: number }

const FLOOR_COVERINGS = /gilam|rug|carpet|kovrolin/i
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
 * floor are replaced, lights and furniture are added (the user's own pieces stay, and new ones
 * avoid them). Returns what was applied; `restoreDesign(snapshot)` undoes it.
 */
export function applyDesignPlan(plan: AiDesignPlan, parts: DesignParts, catalog: CatalogFurniture[]): AppliedCounts {
  const store = useRoomStore.getState()
  const applied: AppliedCounts = { walls: false, floor: false, lights: 0, furniture: 0, skipped: 0 }

  if (parts.walls && plan.walls.main) {
    const main = plan.walls.main
    store.setWallCovering(
      'ALL',
      main.type === 'paint'
        ? { kind: 'paint', color: main.color }
        : { kind: 'oboy', patternId: main.pattern, baseColor: main.base_color, accentColor: main.accent_color },
    )
    if (plan.walls.accent) store.setWallCovering(plan.walls.accent.wall, { kind: 'paint', color: plan.walls.accent.color })
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
    const nthByZone = new Map<string, number>()
    for (const light of plan.lights) {
      const type = lightType(light.type)
      const key = `${light.zone}:${type.mount === 'wall'}`
      const nth = nthByZone.get(key) ?? 0
      nthByZone.set(key, nth + 1)
      const spot = lightSpot(light.zone, type.mount, model, nth)
      store.addLight({ id: nanoid(), type: type.id as LightTypeId, ...spot })
      applied.lights++
    }
  }

  if (parts.furniture) {
    const byId = new Map(catalog.map((c) => [c.id, c]))
    const taken: Rect[] = useRoomStore.getState().furniture.map((f) => {
      const size = sizeOf(byId.get(f.furniture_id))
      return { x: f.x / 1000, z: f.y / 1000, w: size.w, d: size.d, rotation: f.rotation }
    })
    // Rugs lie under everything and block nothing; the rest go largest first, so the sofa gets its wall.
    const items = plan.furniture.map((p) => ({ p, item: byId.get(p.id) }))
    const isRug = (i: (typeof items)[number]) => FLOOR_COVERINGS.test(`${i.item?.category ?? ''} ${i.p.name}`)
    const area = (i: (typeof items)[number]) => sizeOf(i.item).w * sizeOf(i.item).d
    items.sort((a, b) => Number(isRug(b)) - Number(isRug(a)) || area(b) - area(a))

    for (const entry of items) {
      const size = sizeOf(entry.item)
      const rug = isRug(entry)
      const spot = furnitureSpot(rug ? 'center' : entry.p.zone, size, model, rug ? [] : taken)
      // A piece that only fits across a door or window, or on top of another, is left out: a bare
      // corner is better than a blocked door. Rugs lie flat and always go in.
      if (!rug && spot.fit !== 'ok') { applied.skipped++; continue }
      if (!rug) taken.push(spot.rect)
      store.placeFurniture({
        id: nanoid(), furniture_id: entry.p.id, x: spot.x * 1000, y: spot.z * 1000, rotation: spot.rotation,
      })
      applied.furniture++
    }
  }
  return applied
}
