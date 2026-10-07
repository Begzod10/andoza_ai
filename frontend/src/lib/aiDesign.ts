import { nanoid } from 'nanoid'
import type { AiDesignPlan } from '@/lib/api'
import type { CatalogFurniture } from '@/lib/api'
import { useRoomStore } from '@/store/roomStore'
import type { DesignState, PlacedFurniture, PlacedLight } from '@/store/roomStore'
import { FLOOR_PATTERN_DEFS } from '@/lib/floorGeometry'
import type { FloorPatternId } from '@/lib/floorGeometry'
import { lightType } from '@/lib/lightCatalog'
import type { LightTypeId } from '@/lib/lightCatalog'
import { furniturePlacementMm, nextLightPositionMm } from '@/lib/placement'
import { furnitureSpot, isFourWallRoom, isZone, lightSpot, type Rect } from '@/lib/aiDesignLayout'

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

export interface AppliedCounts { walls: boolean; floor: boolean; lights: number; furniture: number }

const FLOOR_COVERINGS = /gilam|rug|carpet|kovrolin/i
const FALLBACK_SIZE = { w: 0.9, d: 0.7 }

/** A catalog item's footprint in metres (the catalog stores centimetres). */
function sizeOf(item: CatalogFurniture | undefined): { w: number; d: number } {
  return item?.footprint_w && item.footprint_d ? { w: item.footprint_w / 100, d: item.footprint_d / 100 } : FALLBACK_SIZE
}

/**
 * Puts the chosen parts of a plan into the room, on top of what is there: the wall finish and the
 * floor are replaced, lights and furniture are added (the user's own pieces stay, and new ones
 * avoid them). Returns what was applied; `restoreDesign(snapshot)` undoes it.
 */
export function applyDesignPlan(plan: AiDesignPlan, parts: DesignParts, catalog: CatalogFurniture[]): AppliedCounts {
  const store = useRoomStore.getState()
  const applied: AppliedCounts = { walls: false, floor: false, lights: 0, furniture: 0 }

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
  const fourWalls = isFourWallRoom(geometry)

  if (parts.lights) {
    const nthByZone = new Map<string, number>()
    for (const [i, light] of plan.lights.entries()) {
      const type = lightType(light.type)
      let spot: { xMm: number; zMm: number; wallId?: string }
      if (fourWalls && isZone(light.zone)) {
        const key = `${light.zone}:${type.mount === 'wall'}`
        const nth = nthByZone.get(key) ?? 0
        nthByZone.set(key, nth + 1)
        spot = lightSpot(light.zone, type.mount, geometry, nth)
      } else {
        spot = nextLightPositionMm(geometry, useRoomStore.getState().lights.length + i)
      }
      store.addLight({ id: nanoid(), type: type.id as LightTypeId, ...spot })
      applied.lights++
    }
  }

  if (parts.furniture) {
    const byId = new Map(catalog.map((c) => [c.id, c]))
    const taken: Rect[] = useRoomStore.getState().furniture.map((f) => {
      const size = sizeOf(byId.get(f.furniture_id))
      return { x: f.x / 1000, z: f.y / 1000, hw: size.w / 2, hd: size.d / 2 }
    })
    // Rugs lie under everything and block nothing; the rest go largest first, so the sofa gets its wall.
    const items = plan.furniture.map((p) => ({ p, item: byId.get(p.id) }))
    const isRug = (i: (typeof items)[number]) => FLOOR_COVERINGS.test(`${i.item?.category ?? ''} ${i.p.name}`)
    const area = (i: (typeof items)[number]) => sizeOf(i.item).w * sizeOf(i.item).d
    items.sort((a, b) => Number(isRug(b)) - Number(isRug(a)) || area(b) - area(a))

    for (const [i, entry] of items.entries()) {
      const size = sizeOf(entry.item)
      let x: number, y: number, rotation = 0
      if (fourWalls && isZone(entry.p.zone)) {
        const spot = furnitureSpot(isRug(entry) ? 'center' : entry.p.zone, size, geometry, isRug(entry) ? [] : taken)
        x = spot.x * 1000; y = spot.z * 1000; rotation = spot.rotation
        if (!isRug(entry)) taken.push(spot.rect)
      } else {
        ;({ x, y } = furniturePlacementMm(geometry, useRoomStore.getState().furniture.length + i, size))
      }
      store.placeFurniture({ id: nanoid(), furniture_id: entry.p.id, x, y, rotation })
      applied.furniture++
    }
  }
  return applied
}
