/**
 * Lays real AI plans (from backend/scripts/eval_ai_design.py) out in the rooms they were made for
 * and checks the result: inside the room, no overlaps, no door blocked, how many pieces were left out.
 *
 *   AI_EVAL_FILE=/tmp/eval.json npx vitest run src/lib/__tests__/aiDesignEval.test.ts
 *
 * Skipped unless AI_EVAL_FILE is set: it needs plans from a manual, paid run.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { useRoomStore } from '@/store/roomStore'
import type { AiDesignPlan, CatalogFurniture } from '@/lib/api'
import { ALL_PARTS, applyDesignPlan } from '../aiDesign'
import { rectBounds, roomModel, type Rect } from '../aiDesignLayout'

const file = process.env.AI_EVAL_FILE
const hits = (a: Rect, b: Rect) => {
  const p = rectBounds(a), q = rectBounds(b)
  return p.minX < q.maxX && q.minX < p.maxX && p.minZ < q.maxZ && q.minZ < p.maxZ
}

describe.skipIf(!file)('real AI plans, laid out', () => {
  it('stay inside the room, clear of doors and of each other', () => {
    const data = JSON.parse(fs.readFileSync(file!, 'utf8'))
    const catalog: CatalogFurniture[] = data.catalog.map((c: Record<string, unknown>) => ({
      ...c, store_id: null, store_name: null, price_uzs: null, glb_url: 'x', thumbnail_url: null,
    }))
    const byId = new Map(catalog.map((c) => [c.id, c]))
    const rows: Record<string, number>[] = []
    const bad: string[] = []

    for (const run of data.runs.filter((r: { plan: unknown }) => r.plan)) {
      const room = data.rooms[run.room]
      useRoomStore.getState().resetRoom()
      const geometry: Record<string, unknown> = { walls: room.walls }
      if (room.vertices) geometry.vertices = room.vertices
      useRoomStore.getState().loadRoom({ geometry, ceiling_h: 2.7 } as never)
      useRoomStore.setState({ lights: [], furniture: [] })
      const applied = applyDesignPlan(run.plan as AiDesignPlan, ALL_PARTS, catalog)
      const model = roomModel(useRoomStore.getState().geometry)
      const placed = useRoomStore.getState().furniture.map((f) => {
        const c = byId.get(f.furniture_id)!
        return { c, rect: { x: f.x / 1000, z: f.y / 1000, w: c.footprint_w! / 100, d: c.footprint_d! / 100, rotation: f.rotation } as Rect }
      })
      const solid = placed.filter((p) => !/gilam/i.test(p.c.name_uz))
      const doors = model.clear.filter((z) => z.kind === 'door').map((z) => z.rect)
      let overlaps = 0
      for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) if (hits(solid[i].rect, solid[j].rect)) overlaps++
      const outside = placed.filter((p) => !model.inside(p.rect)).length
      const blocksDoor = solid.filter((p) => doors.some((z) => hits(p.rect, z))).length
      rows.push({ asked: run.plan.furniture.length, placed: placed.length, skipped: applied.skipped, overlaps, outside, blocksDoor })
      if (overlaps || outside || blocksDoor) bad.push(`${run.id}: overlaps ${overlaps}, outside ${outside}, door ${blocksDoor}`)
    }

    const sum = (k: string) => rows.reduce((s, r) => s + r[k], 0)
    console.log(`plans ${rows.length}: pieces asked ${sum('asked')}, placed ${sum('placed')}, left out ${sum('skipped')}; ` +
      `overlaps ${sum('overlaps')}, outside ${sum('outside')}, door blocked ${sum('blocksDoor')}`)
    expect(bad).toEqual([])
  })
})
