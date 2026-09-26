import type { PlacedElectrical } from '@/store/roomStore'
import {
  nearestEdge, offsetPolygon, perimeterCoord, perimeterCorners, perimeterPoint,
  pointAtWallPosition,
  type PlanEdge, type PlanPolygon,
} from '@/lib/planPolygon'
import * as THREE from 'three'
import { MM_PX, PAD, SCALE, WIRE_INSET, WIRE_OFS, ELEC_DIMS_3D } from './constants'
import type { WallFrame, WallHover, WallId } from './types'

// ─── SVG coordinate helpers ────────────────────────────────────────────────────

export function svgPt(svg: SVGSVGElement, e: React.MouseEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const m = svg.getScreenCTM()
  if (!m) return { x: 0, y: 0 }
  const t = pt.matrixTransform(m.inverse())
  return { x: t.x, y: t.y }
}

export function detectWall(
  x: number, y: number, W: number, D: number,
  thresh = 22,
): { wallId: WallId; positionMm: number; sx: number; sy: number } | null {
  const rW = W * SCALE
  const rD = D * SCALE
  const rx = x - PAD
  const ry = y - PAD

  const candidates = [
    { wallId: 'A' as WallId, dist: Math.abs(ry),      valid: rx >= 0 && rx <= rW, px: rx,  py: 0  },
    { wallId: 'C' as WallId, dist: Math.abs(ry - rD), valid: rx >= 0 && rx <= rW, px: rx,  py: rD },
    { wallId: 'D' as WallId, dist: Math.abs(rx),      valid: ry >= 0 && ry <= rD, px: 0,   py: ry },
    { wallId: 'B' as WallId, dist: Math.abs(rx - rW), valid: ry >= 0 && ry <= rD, px: rW,  py: ry },
  ].filter(c => c.valid && c.dist <= thresh).sort((a, b) => a.dist - b.dist)

  if (!candidates.length) return null
  const c = candidates[0]
  const lenM = (c.wallId === 'A' || c.wallId === 'C') ? W : D
  const rawM = (c.wallId === 'A' || c.wallId === 'C') ? rx / SCALE : ry / SCALE
  const posM = Math.max(0.1, Math.min(lenM - 0.1, rawM))
  return { wallId: c.wallId, positionMm: Math.round(posM * 1000), sx: PAD + c.px, sy: PAD + c.py }
}

export function wallDeviceSvgPos(e: PlacedElectrical, W: number, D: number): { x: number; y: number } {
  const p = e.positionMm / 1000 * SCALE
  switch (e.wallId) {
    case 'A': return { x: PAD + p, y: PAD }
    case 'C': return { x: PAD + p, y: PAD + D * SCALE }
    case 'D': return { x: PAD,     y: PAD + p }
    case 'B': return { x: PAD + W * SCALE, y: PAD + p }
    default:  return { x: PAD, y: PAD }
  }
}

// ─── Polygon (N-wall) rooms ───────────────────────────────────────────────────
// A scanned / hand-drawn room has walls W1..Wn and its outline in
// geometry.vertices. lib/planPolygon.ts puts that outline in the plan frame
// the rectangle already uses (mm; world + (W/2, D/2), so the 3D scene agrees),
// and here it is mapped to px with the polygon's own bounding-box corner at
// PAD — the SVG stays W×D px plus padding, like the rectangle's. A device sits
// on a named edge at a wall position measured from that edge's position-0 end
// (the convention the 3D opening layer, wallDefsFromVertices, uses too), and
// wires follow the polygon's perimeter coordinate instead of the rectangle's
// 2(W+D) loop. The rectangle code above is left exactly as it was.

export function polyToPx(poly: PlanPolygon, x: number, z: number): [number, number] {
  return [PAD + (x - poly.minX) * MM_PX, PAD + (z - poly.minZ) * MM_PX]
}

export function polyFromPx(poly: PlanPolygon, px: number, py: number): { x: number; z: number } {
  return { x: poly.minX + (px - PAD) / MM_PX, z: poly.minZ + (py - PAD) / MM_PX }
}

export function polyEdge(poly: PlanPolygon, wallId: string): PlanEdge | undefined {
  return poly.edges.find((e) => e.id === wallId)
}

/** Symbol rotation so its +x ("into the room") side follows the wall's inward normal. */
export function edgeRotDeg(e: PlanEdge): number {
  return (Math.atan2(e.nz, e.nx) * 180) / Math.PI
}

/** Rotation that lays a horizontal shape along the wall. */
export function edgeAngleDeg(e: PlanEdge): number {
  return (Math.atan2(e.dz, e.dx) * 180) / Math.PI
}

export function detectPolyWall(poly: PlanPolygon, x: number, y: number, thresh = 22): WallHover | null {
  const p = polyFromPx(poly, x, y)
  const hit = nearestEdge(poly, p.x, p.z)
  if (!hit || hit.dist * MM_PX > thresh) return null
  const positionMm = Math.round(Math.max(100, Math.min(hit.edge.len - 100, hit.position)))
  const q = pointAtWallPosition(hit.edge, positionMm)
  const [sx, sy] = polyToPx(poly, q.x, q.z)
  return { wallId: hit.edge.id, positionMm, sx, sy, rotDeg: edgeRotDeg(hit.edge), angleDeg: edgeAngleDeg(hit.edge) }
}

/** Null when the device's wall is not one of this polygon's edges. */
export function polyDeviceSvgPos(poly: PlanPolygon, e: PlacedElectrical): { x: number; y: number; rotDeg: number } | null {
  const edge = polyEdge(poly, e.wallId)
  if (!edge) return null
  const q = pointAtWallPosition(edge, e.positionMm)
  const [x, y] = polyToPx(poly, q.x, q.z)
  return { x, y, rotDeg: edgeRotDeg(edge) }
}

/** Perimeter coordinate in metres, like wirePerimCoord; null for an unknown wall. */
export function polyPerimCoord(poly: PlanPolygon, wallId: string, posMm: number): number | null {
  const edge = polyEdge(poly, wallId)
  return edge ? perimeterCoord(edge, posMm) / 1000 : null
}

export function polyRouteSvgPts(poly: PlanPolygon, dev: PlacedElectrical, panel: PlacedElectrical, cw: boolean): [number, number][] | null {
  const devC = polyPerimCoord(poly, dev.wallId, dev.positionMm)
  const panC = polyPerimCoord(poly, panel.wallId, panel.positionMm)
  if (devC === null || panC === null) return null
  const insetMm = WIRE_INSET / MM_PX
  const inner = offsetPolygon(poly, -insetMm) // mitred inset corners, one per edge start
  const at = (cMm: number): [number, number] => {
    const q = perimeterPoint(poly, cMm, insetMm)
    return polyToPx(poly, q.x, q.z)
  }
  const corners = perimeterCorners(poly, devC * 1000, panC * 1000, cw).map((c) => {
    const i = poly.edges.findIndex((e) => Math.abs(e.start - c) < 1e-6)
    return i >= 0 ? polyToPx(poly, inner[i][0], inner[i][1]) : at(c)
  })
  return [at(devC * 1000), ...corners, at(panC * 1000)]
}

/** Plan mm → 3D world metres (the polygon's centroid is the scene origin). */
export function polyWorld(poly: PlanPolygon, x: number, z: number): [number, number] {
  return [(x - poly.W / 2) / 1000, (z - poly.D / 2) / 1000]
}

export function polyElecPos3D(poly: PlanPolygon, el: PlacedElectrical): { px: number; py: number; pz: number; ry: number } | null {
  const edge = polyEdge(poly, el.wallId)
  if (!edge) return null
  const dim = ELEC_DIMS_3D[el.type]
  const depth = el.type === 'panel' ? 0.12 : 0.018
  const q = pointAtWallPosition(edge, el.positionMm, (depth / 2 + 0.004) * 1000)
  const [px, pz] = polyWorld(poly, q.x, q.z)
  return { px, py: el.heightMm / 1000 + dim.h / 2, pz, ry: Math.atan2(edge.nx, edge.nz) }
}

export function polyRouteWire3D(poly: PlanPolygon, dev: PlacedElectrical, panel: PlacedElectrical, wireH: number, cw: boolean): THREE.Vector3[] | null {
  const devC = polyPerimCoord(poly, dev.wallId, dev.positionMm)
  const panC = polyPerimCoord(poly, panel.wallId, panel.positionMm)
  if (devC === null || panC === null) return null
  const devH = dev.heightMm / 1000 + ELEC_DIMS_3D[dev.type].h / 2
  const panH = panel.heightMm / 1000 + ELEC_DIMS_3D[panel.type].h / 2
  const pt = (cMm: number, h: number) => {
    const q = perimeterPoint(poly, cMm, WIRE_OFS * 1000)
    const [x, z] = polyWorld(poly, q.x, q.z)
    return new THREE.Vector3(x, h, z)
  }
  const corners = perimeterCorners(poly, devC * 1000, panC * 1000, cw)
  return [
    pt(devC * 1000, devH),
    pt(devC * 1000, wireH),
    ...corners.map((c) => pt(c, wireH)),
    pt(panC * 1000, wireH),
    pt(panC * 1000, panH),
  ]
}

/** Opening frames (see WallFrame) for a polygon's walls, in px. */
export function polyFrames(poly: PlanPolygon): WallFrame[] {
  return poly.edges.map((e) => {
    const [ox, oy] = polyToPx(poly, e.ox, e.oz)
    return {
      id: e.id,
      wallLenMm: e.len,
      toSvg: (u, v) => [ox + e.dx * u + e.nx * v, oy + e.dz * u + e.nz * v],
    }
  })
}

// ─── Wire routing (wall-surface only) ────────────────────────────────────────

// Perimeter coordinate (metres, clockwise from AD/top-left corner)
//   Wall A (top):    0 → W         (left to right)
//   Wall B (right):  W → W+D       (top to bottom)
//   Wall C (bottom): W+D → 2W+D    (right to left)
//   Wall D (left):   2W+D → 2W+2D  (bottom to top)
export function wirePerimCoord(wallId: WallId, posMm: number, W: number, D: number): number {
  const p = posMm / 1000
  switch (wallId) {
    case 'A': return p
    case 'B': return W + p
    case 'C': return 2*W + D - p
    case 'D': return 2*W + 2*D - p
  }
}

// Wall-surface SVG point with inward offset so wire is visible inside room
export function perimToSvgPt(c: number, W: number, D: number): [number, number] {
  const perim = 2*(W+D)
  c = ((c % perim) + perim) % perim
  const rW = W*SCALE, rD = D*SCALE
  const WI = WIRE_INSET
  if (c <= W)     return [PAD + c*SCALE,             PAD + WI]
  if (c <= W+D)   return [PAD + rW - WI,             PAD + (c-W)*SCALE]
  if (c <= 2*W+D) return [PAD + (2*W+D-c)*SCALE,    PAD + rD - WI]
  return               [PAD + WI,                   PAD + (2*W+2*D-c)*SCALE]
}

// Corner point — intersection of two adjacent inset wall wires
export function cornerInsetSvg(cornerCoord: number, W: number, D: number): [number, number] {
  const rW = W*SCALE, rD = D*SCALE, WI = WIRE_INSET
  const perim = 2*(W+D)
  const c = ((cornerCoord % perim) + perim) % perim
  if (c < 1e-4 || c > perim - 1e-4)     return [PAD + WI,       PAD + WI]      // AD
  if (Math.abs(c - W) < 1e-4)            return [PAD + rW - WI,  PAD + WI]      // AB
  if (Math.abs(c - (W+D)) < 1e-4)        return [PAD + rW - WI,  PAD + rD - WI] // CB
  if (Math.abs(c - (2*W+D)) < 1e-4)      return [PAD + WI,       PAD + rD - WI] // CD
  return perimToSvgPt(c, W, D)
}

export function perimTo3DPt(c: number, W: number, D: number, h: number): THREE.Vector3 {
  const perim = 2*(W+D)
  c = ((c % perim) + perim) % perim
  if (c <= W)     return new THREE.Vector3(c - W/2,           h, -D/2 + WIRE_OFS)
  if (c <= W+D)   return new THREE.Vector3(W/2 - WIRE_OFS,   h, (c-W) - D/2)
  if (c <= 2*W+D) return new THREE.Vector3((2*W+D-c) - W/2,  h, D/2 - WIRE_OFS)
  return               new THREE.Vector3(-W/2 + WIRE_OFS,    h, D/2 - (c - 2*W - D))
}

// Is the clockwise direction (increasing coord) the shorter route?
export function shortestCW(devC: number, panC: number, perim: number): boolean {
  return (panC - devC + perim) % perim <= perim / 2
}

// Corner coords encountered going CW from `from` to `to`
export function cwCorners(from: number, to: number, W: number, D: number): number[] {
  const perim = 2*(W+D)
  const dist = (to - from + perim) % perim
  return [0, W, W+D, 2*W+D]
    .map(c => ({ c, d: (c - from + perim) % perim }))
    .filter(x => x.d > 1e-6 && x.d < dist - 1e-6)
    .sort((a, b) => a.d - b.d)
    .map(x => x.c)
}

// Corner coords encountered going CCW from `from` to `to`
export function ccwCorners(from: number, to: number, W: number, D: number): number[] {
  const perim = 2*(W+D)
  const dist = (from - to + perim) % perim
  return [0, W, W+D, 2*W+D]
    .map(c => ({ c, d: (from - c + perim) % perim }))
    .filter(x => x.d > 1e-6 && x.d < dist - 1e-6)
    .sort((a, b) => a.d - b.d)
    .map(x => x.c)
}

// 2D wall-perimeter SVG waypoints for one wire
export function routeSvgPts(dev: PlacedElectrical, panel: PlacedElectrical, W: number, D: number, cw: boolean): [number, number][] {
  const devC = wirePerimCoord(dev.wallId as WallId,   dev.positionMm,   W, D)
  const panC = wirePerimCoord(panel.wallId as WallId, panel.positionMm, W, D)
  const corners = cw ? cwCorners(devC, panC, W, D) : ccwCorners(devC, panC, W, D)
  return [
    perimToSvgPt(devC, W, D),
    ...corners.map(c => cornerInsetSvg(c, W, D)),
    perimToSvgPt(panC, W, D),
  ]
}

// 3D wall-surface waypoints: vertical up from device → horizontal at wire channel → vertical down to panel
// wireH is pre-computed by ElektrScene to sit above all opening tops in the room
export function routeWire3D(dev: PlacedElectrical, panel: PlacedElectrical, W: number, D: number, wireH: number, cw: boolean): THREE.Vector3[] {
  const dim  = ELEC_DIMS_3D[dev.type]
  const pdim = ELEC_DIMS_3D[panel.type]
  const devH = dev.heightMm   / 1000 + dim.h  / 2
  const panH = panel.heightMm / 1000 + pdim.h / 2
  const devC = wirePerimCoord(dev.wallId as WallId,   dev.positionMm,   W, D)
  const panC = wirePerimCoord(panel.wallId as WallId, panel.positionMm, W, D)
  const corners = cw ? cwCorners(devC, panC, W, D) : ccwCorners(devC, panC, W, D)
  return [
    perimTo3DPt(devC, W, D, devH),
    perimTo3DPt(devC, W, D, wireH),
    ...corners.map(c => perimTo3DPt(c, W, D, wireH)),
    perimTo3DPt(panC, W, D, wireH),
    perimTo3DPt(panC, W, D, panH),
  ]
}

// ─── Dimension formatting ──────────────────────────────────────────────────────

export function fmtM(mm: number): string {
  const m = mm / 1000
  return m < 0.01 ? `${mm}mm` : `${m.toFixed(2).replace(/\.?0+$/, '')}m`
}

// ─── 3D Elektr view ───────────────────────────────────────────────────────────

export function elecPos3D(el: PlacedElectrical, W: number, D: number) {
  const isPanel = el.type === 'panel'
  const dim = ELEC_DIMS_3D[el.type]
  const depth = isPanel ? 0.12 : 0.018
  const T = 0.004
  const cy = el.heightMm / 1000 + dim.h / 2
  const pos = el.positionMm / 1000
  switch (el.wallId as WallId) {
    case 'A': return { px: pos - W/2, py: cy, pz: -(D/2) + depth/2 + T, ry: 0 }
    case 'C': return { px: pos - W/2, py: cy, pz: D/2 - depth/2 - T, ry: Math.PI }
    case 'D': return { px: -(W/2) + depth/2 + T, py: cy, pz: pos - D/2, ry: Math.PI/2 }
    case 'B': return { px: W/2 - depth/2 - T, py: cy, pz: pos - D/2, ry: -Math.PI/2 }
  }
}
