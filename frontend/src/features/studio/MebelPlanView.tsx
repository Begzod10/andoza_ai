/**
 * 2D floor-plan editor for the Mebelirovka tab.
 *
 * Left palette: selectable door/window/balcony-door tools (elektr-sidebar
 * style), then the list of furniture standing in the room. Clicking a wall in
 * the plan places the selected element there; existing elements can be dragged
 * along their wall, selected, resized via the inspector row, and deleted.
 * Every model placed in the 3D scene is drawn here as its top-down silhouette
 * and can be dragged, turned, resized or removed from the plan. All edits go
 * straight to the room store, so the 3D viewport next to this view updates
 * live — and vice versa.
 */
import { useCallback, useRef, useState } from 'react'
import { useRoomStore } from '@/store/roomStore'
import type { PlacedFurniture, WallElement } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'
import { hullBounds, type Hull } from '@/lib/modelFootprint'
import { DEFAULT_WINDOW_STYLE, mullionCount, resolveWindowStyle } from '@/lib/windowStyles'
import { PlanFurnitureLayer, itemScale, resolveFurnitureEntry } from './PlanFurniture'
import { WindowStylePicker } from './WindowStylePicker'
import { planTheme } from './planTheme'

type ElType = WallElement['type']

const T = 250          // wall thickness in plan, mm
const MARGIN = 520     // viewBox margin for labels, mm
// Minimum pier between an opening and the room corner — keeps the wall
// band continuous around corners ("welded" look, and buildable in reality)
const CORNER_MARGIN = 200
// Minimum clear wall between two openings (user requirement: 20 cm)
const EL_GAP = 200
// Dragging snaps to this grid (mm) — raw pointer coords would otherwise give
// arbitrary 1mm positions like 1293/1507.
const DRAG_STEP = 5
// Furniture drags on a coarser grid than wall openings, and keeps a small
// clearance from the wall faces (same 50mm the 3D viewport uses).
const FUR_STEP = 10
const FUR_WALL_GAP = 50

/**
 * Nearest collision-free position for an element of `width` on a wall.
 * Respects corner piers and a minimum gap to every other element.
 * Returns null when the element cannot fit anywhere near the desired spot.
 */
function clampElementPosition(
  desired: number,
  width: number,
  wallLen: number,
  others: Array<{ position: number; width: number }>,
): number | null {
  const minPos = CORNER_MARGIN
  const maxPos = wallLen - width - CORNER_MARGIN
  if (maxPos < minPos) return null
  let pos = Math.min(Math.max(desired, minPos), maxPos)
  const sorted = [...others].sort((a, b) => a.position - b.position)
  for (const o of sorted) {
    const before = o.position - EL_GAP - width // last valid pos left of o
    const after = o.position + o.width + EL_GAP // first valid pos right of o
    if (pos > before && pos < after) {
      pos = desired - before <= after - desired ? before : after
    }
  }
  pos = Math.min(Math.max(pos, minPos), maxPos)
  const ok = sorted.every(
    (o) => pos + width + EL_GAP <= o.position || pos >= o.position + o.width + EL_GAP,
  )
  return ok ? Math.round(pos) : null
}

const DEFAULTS: Record<ElType, Omit<WallElement, 'id' | 'position'>> = {
  deraza: { type: 'deraza', width: 900, height: 1200, sill_height: 800 },
  eshik: { type: 'eshik', width: 900, height: 2100, sill_height: 0 },
  balkon: { type: 'balkon', width: 1500, height: 2100, sill_height: 0 },
}

const TOOL_META: Array<{ type: ElType; label: string; hint: string }> = [
  { type: 'eshik', label: 'Eshik', hint: '900 × 2100' },
  { type: 'deraza', label: 'Deraza', hint: '900 × 1200' },
  { type: 'balkon', label: 'Balkon eshigi', hint: '1500 × 2100' },
]

// Every colour, weight and type size comes from the shared plan theme so the
// furniture plan and the lighting plan cannot drift apart again.
const { palette: C, weights: LW, type: TY } = planTheme
const SELECT = C.selection
/** Sidebar glyphs sit on the light UI surface, not on the dark plan sheet. */
const ICON = '#4A5160'

interface WallDef {
  id: string
  len: number          // interior length mm (u axis)
  /** SVG transform mapping local (u,v) → plan coords; v=0 outer edge, v=T inner */
  transform: string
  /** which global axis carries u for pointer math */
  uAxis: 'x' | 'y'
}

/**
 * Architectural dimension chain for the selected element: wall edge → element
 * → wall edge, drawn in GLOBAL plan coordinates (the per-wall transforms
 * mirror/rotate, which would flip text).
 */
function DimRuler({ wallId, len, p, w, W, Dp }: {
  wallId: string; len: number; p: number; w: number; W: number; Dp: number
}) {
  const horizontal = wallId === 'A' || wallId === 'C'
  const OFF = 450
  const fixed = wallId === 'A' ? OFF : wallId === 'C' ? Dp - OFF : wallId === 'B' ? W - OFF : OFF
  const edge = wallId === 'A' ? 0 : wallId === 'C' ? Dp : wallId === 'B' ? W : 0
  const spans: Array<[number, number, boolean]> = (
    [[0, p, false], [p, p + w, true], [p + w, len, false]] as Array<[number, number, boolean]>
  ).filter(([a, b]) => b - a > 1)

  return (
    <g stroke="#8A857A" strokeWidth={18} fontFamily="ui-sans-serif, system-ui" fontWeight={600}>
      {spans.map(([a, b, isEl], i) => {
        const mid = (a + b) / 2
        const label = String(Math.round(b - a))
        const color = isEl ? SELECT : C.dimension
        if (horizontal) {
          return (
            <g key={i}>
              <line x1={a} y1={fixed} x2={b} y2={fixed} stroke={color} />
              <line x1={a} y1={fixed - 110} x2={a} y2={fixed + 110} stroke={color} />
              <line x1={b} y1={fixed - 110} x2={b} y2={fixed + 110} stroke={color} />
              <line x1={a} y1={edge} x2={a} y2={fixed} strokeDasharray="40 50" strokeWidth={9} />
              <line x1={b} y1={edge} x2={b} y2={fixed} strokeDasharray="40 50" strokeWidth={9} />
              <text x={mid} y={fixed - 80} textAnchor="middle" fontSize={180} fill={color} stroke="none">{label}</text>
            </g>
          )
        }
        const textX = wallId === 'D' ? fixed + 140 : fixed - 140
        return (
          <g key={i}>
            <line x1={fixed} y1={a} x2={fixed} y2={b} stroke={color} />
            <line x1={fixed - 110} y1={a} x2={fixed + 110} y2={a} stroke={color} />
            <line x1={fixed - 110} y1={b} x2={fixed + 110} y2={b} stroke={color} />
            <line x1={edge} y1={a} x2={fixed} y2={a} strokeDasharray="40 50" strokeWidth={9} />
            <line x1={edge} y1={b} x2={fixed} y2={b} strokeDasharray="40 50" strokeWidth={9} />
            <text x={textX} y={mid} textAnchor={wallId === 'D' ? 'start' : 'end'} dominantBaseline="middle" fontSize={180} fill={color} stroke="none">{label}</text>
          </g>
        )
      })}
    </g>
  )
}

/**
 * Millimetre input that can be typed into freely.
 *
 * A plain controlled `value={n}` input is unusable here: the commit handlers
 * clamp (width to >= 200mm, position to the collision-free range), so every
 * intermediate keystroke of "1800" — "1", "18", "180" — snapped straight back
 * to the clamped value, and clearing the field committed 0. While the field is
 * focused we therefore keep the raw string and only commit values that pass
 * `min`/`max`; anything else is held as a draft until the user finishes.
 * On blur the draft is dropped so the field re-syncs with the real value.
 */
function MmInput({ value, onCommit, step = 50, min = 0, max }: {
  value: number
  onCommit: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <input
      type="number" step={step} min={min} max={max}
      value={draft ?? String(value)}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        // Commit only once the typed number is inside the allowed range —
        // partial entries like "1" or "" must not overwrite the element.
        if (raw.trim() === '') return
        const n = Number(raw)
        if (!Number.isFinite(n)) return
        if (n < min || (max !== undefined && n > max)) return
        onCommit(n)
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      className="w-16 border border-gray-300 rounded px-1 py-0.5 text-[11px] text-gray-800"
    />
  )
}

export interface MebelPlanViewProps {
  /**
   * The room's own name, drawn centred as the plan's label. Optional because
   * the plan is also rendered from places that have only geometry.
   */
  roomName?: string
  /** Corridor-style hatching on the floor, as the reference uses for a foyer. */
  floorHatch?: boolean
}

export function MebelPlanView({ roomName, floorHatch = false }: MebelPlanViewProps = {}) {
  const geometry = useRoomStore((s) => s.geometry)
  const addElement = useRoomStore((s) => s.addElement)
  const updateElement = useRoomStore((s) => s.updateElement)
  const removeElement = useRoomStore((s) => s.removeElement)
  const furniture = useRoomStore((s) => s.furniture)
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const moveFurniture = useRoomStore((s) => s.moveFurniture)
  const resizeFurniture = useRoomStore((s) => s.resizeFurniture)
  const removeFurniture = useRoomStore((s) => s.removeFurniture)

  const [tool, setTool] = useState<ElType | null>('eshik')
  const [selected, setSelected] = useState<{ wallId: string; id: string } | null>(null)
  // Window type the next placed window gets — the picker doubles as the
  // "which window do you want?" prompt before anything exists on the wall.
  const [newWindowStyle, setNewWindowStyle] = useState(DEFAULT_WINDOW_STYLE)
  const [selectedFur, setSelectedFur] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ wallId: string; id: string; grabOffset: number; uAxis: 'x' | 'y'; len: number; width: number } | null>(null)
  // Silhouettes reported by the drawn symbols — the drag clamp uses the real
  // outline, so a round chair is not held off the wall by its square box.
  const hullsRef = useRef<Map<string, Hull>>(new Map())
  const furDragRef = useRef<{ id: string; offX: number; offY: number } | null>(null)
  const onHull = useCallback((id: string, hull: Hull) => {
    hullsRef.current.set(id, hull)
  }, [])
  // Right-mouse-button panning of the plan
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number; scale: number } | null>(null)

  const wallA = geometry.walls.find((w) => w.id === 'A')
  const wallB = geometry.walls.find((w) => w.id === 'B')
  const wallC = geometry.walls.find((w) => w.id === 'C')
  const wallD = geometry.walls.find((w) => w.id === 'D')

  if (!wallA || !wallB || !wallC || !wallD) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 p-6 text-center">
        2D plan faqat to'rtburchak (A-B-C-D) xonalar uchun mavjud
      </div>
    )
  }

  const W = wallA.length   // interior width mm
  const Dp = wallB.length  // interior depth mm

  const walls: WallDef[] = [
    { id: 'A', len: W, transform: `translate(0, ${-T})`, uAxis: 'x' },
    { id: 'C', len: W, transform: `translate(0, ${Dp + T}) scale(1,-1)`, uAxis: 'x' },
    { id: 'B', len: Dp, transform: `matrix(0,1,-1,0,${W + T},0)`, uAxis: 'y' },
    { id: 'D', len: Dp, transform: `matrix(0,1,1,0,${-T},0)`, uAxis: 'y' },
  ]

  function svgPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = pt.matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }

  function wallU(wall: WallDef, clientX: number, clientY: number): number {
    const p = svgPointFromClient(clientX, clientY)
    return wall.uAxis === 'x' ? p.x : p.y
  }

  /** Placed item → its plan-space extents around the model origin, in mm. */
  function furExtents(item: PlacedFurniture) {
    const entry = resolveFurnitureEntry(item.furniture_id, userFurniture)
    const hull = hullsRef.current.get(item.id)
    if (entry && hull) {
      const b = hullBounds(hull, item.rotation, itemScale(entry, item) * 1000)
      return b
    }
    // Before the symbol has reported (or without a catalog entry): square box
    const so = item.scaleOverride ?? 1
    const hw = ((entry?.sizeM.w ?? 0.6) * so * 1000) / 2
    const hd = ((entry?.sizeM.d ?? 0.6) * so * 1000) / 2
    const c = Math.abs(Math.cos(item.rotation))
    const s = Math.abs(Math.sin(item.rotation))
    const rw = hw * c + hd * s
    const rd = hw * s + hd * c
    return { minX: -rw, maxX: rw, minZ: -rd, maxZ: rd }
  }

  /** Keep an item's whole footprint inside the room. */
  function clampFurniture(item: PlacedFurniture, planX: number, planY: number) {
    const b = furExtents(item)
    const x = Math.min(
      Math.max(planX, FUR_WALL_GAP - b.minX),
      Math.max(FUR_WALL_GAP - b.minX, W - FUR_WALL_GAP - b.maxX),
    )
    const y = Math.min(
      Math.max(planY, FUR_WALL_GAP - b.minZ),
      Math.max(FUR_WALL_GAP - b.minZ, Dp - FUR_WALL_GAP - b.maxZ),
    )
    return { x, y }
  }

  function startFurnitureDrag(item: PlacedFurniture, e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelectedFur(item.id)
    setSelected(null)
    const p = svgPointFromClient(e.clientX, e.clientY)
    furDragRef.current = {
      id: item.id,
      offX: p.x - (item.x + W / 2),
      offY: p.y - (item.y + Dp / 2),
    }
    // Capture on the <svg> — it owns the move/up handlers that drive the drag
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  function startPan(e: React.PointerEvent<SVGSVGElement>) {
    // A left click that reached the background (the symbols stop propagation)
    // means "nothing selected" — otherwise the inspector row would keep
    // showing an item the user has visually moved on from.
    if (e.button === 0) setSelectedFur(null)
    if (e.button !== 2) return
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const vbWidth = W + 2 * T + 2 * MARGIN
    panRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, scale: vbWidth / rect.width }
    svg.setPointerCapture?.(e.pointerId)
  }

  function resolvedWallEls(wallId: string, len: number) {
    return resolveElementPositions(
      geometry.walls.find((w) => w.id === wallId)?.elements ?? [],
      len,
    )
  }

  function handleWallTap(wall: WallDef, e: React.PointerEvent) {
    if (e.button !== 0) return
    if (!tool) return
    const def = DEFAULTS[tool]
    const u = wallU(wall, e.clientX, e.clientY)
    const pos = clampElementPosition(
      Math.round((u - def.width / 2) / DRAG_STEP) * DRAG_STEP,
      def.width,
      wall.len,
      resolvedWallEls(wall.id, wall.len),
    )
    if (pos === null) return // no collision-free spot on this wall
    addElement(wall.id, {
      ...def,
      position: pos,
      ...(tool === 'deraza' ? { styleId: newWindowStyle } : {}),
    })
    setSelectedFur(null)
    // Select what was just placed: for a window that opens the type gallery
    // right where the user is looking, so they can try the other shapes.
    const placed = useRoomStore.getState().geometry.walls.find((w) => w.id === wall.id)?.elements
    const added = placed?.[placed.length - 1]
    setSelected(added ? { wallId: wall.id, id: added.id } : null)
  }

  function startDrag(wall: WallDef, el: WallElement, e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelected({ wallId: wall.id, id: el.id })
    setSelectedFur(null)
    const u = wallU(wall, e.clientX, e.clientY)
    dragRef.current = {
      wallId: wall.id,
      id: el.id,
      grabOffset: u - el.position,
      uAxis: wall.uAxis,
      len: wall.len,
      width: el.width,
    }
    // Capture on the <svg> — it owns the move/up handlers that drive the drag
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  function handleMove(e: React.PointerEvent) {
    const panState = panRef.current
    if (panState) {
      setPan({
        x: panState.ox - (e.clientX - panState.sx) * panState.scale,
        y: panState.oy - (e.clientY - panState.sy) * panState.scale,
      })
      return
    }
    const fd = furDragRef.current
    if (fd) {
      const item = furniture.find((f) => f.id === fd.id)
      if (!item) return
      const p = svgPointFromClient(e.clientX, e.clientY)
      const snapped = clampFurniture(
        item,
        Math.round((p.x - fd.offX) / FUR_STEP) * FUR_STEP,
        Math.round((p.y - fd.offY) / FUR_STEP) * FUR_STEP,
      )
      moveFurniture(item.id, Math.round(snapped.x - W / 2), Math.round(snapped.y - Dp / 2), item.rotation)
      return
    }
    const d = dragRef.current
    if (!d) return
    const p = svgPointFromClient(e.clientX, e.clientY)
    const u = d.uAxis === 'x' ? p.x : p.y
    const others = resolvedWallEls(d.wallId, d.len).filter((el) => el.id !== d.id)
    // Snap before clamping: the clamp may still return an off-grid value when
    // the element is pushed flush against a corner pier or a neighbour, and
    // that limit must win over the grid.
    const desired = Math.round((u - d.grabOffset) / DRAG_STEP) * DRAG_STEP
    const pos = clampElementPosition(desired, d.width, d.len, others)
    if (pos === null) return // blocked — keep last valid position
    updateElement(d.wallId, d.id, { position: pos })
  }

  function endDrag() {
    dragRef.current = null
    panRef.current = null
    furDragRef.current = null
  }

  const selFur = selectedFur ? furniture.find((f) => f.id === selectedFur) ?? null : null
  const selFurEntry = selFur ? resolveFurnitureEntry(selFur.furniture_id, userFurniture) : undefined

  /** Turn the selected item; the new angle may push it out of the room, so re-clamp. */
  function setFurnitureRotation(deg: number) {
    if (!selFur) return
    const rotation = (deg * Math.PI) / 180
    const p = clampFurniture({ ...selFur, rotation }, selFur.x + W / 2, selFur.y + Dp / 2)
    moveFurniture(selFur.id, Math.round(p.x - W / 2), Math.round(p.y - Dp / 2), rotation)
  }

  function setFurnitureScale(percent: number) {
    if (!selFur) return
    const scaleOverride = Math.max(0.1, Math.min(5, percent / 100))
    resizeFurniture(selFur.id, scaleOverride)
    const p = clampFurniture({ ...selFur, scaleOverride }, selFur.x + W / 2, selFur.y + Dp / 2)
    moveFurniture(selFur.id, Math.round(p.x - W / 2), Math.round(p.y - Dp / 2), selFur.rotation)
  }

  const selEl = selected
    ? geometry.walls.find((w) => w.id === selected.wallId)?.elements.find((e) => e.id === selected.id)
    : null

  // Resolved copy of the selection: auto-centred elements store position 0,
  // but dimensions and edits must use the actual placed position.
  const selWallLen = selected ? (selected.wallId === 'A' || selected.wallId === 'C' ? W : Dp) : 0
  const selResolved = selected
    ? resolveElementPositions(
        geometry.walls.find((w) => w.id === selected.wallId)?.elements ?? [],
        selWallLen,
      ).find((e) => e.id === selected.id) ?? null
    : null

  function setSelectedPos(posMm: number) {
    if (!selected || !selResolved) return
    const others = resolvedWallEls(selected.wallId, selWallLen).filter((el) => el.id !== selected.id)
    const clamped = clampElementPosition(posMm, selResolved.width, selWallLen, others)
    if (clamped === null) return
    updateElement(selected.wallId, selected.id, { position: clamped })
  }

  /** Width change that keeps the element collision-free (rejected if it can't fit). */
  function setSelectedWidth(widthMm: number) {
    if (!selected || !selResolved) return
    const w = Math.max(200, Math.round(widthMm))
    const others = resolvedWallEls(selected.wallId, selWallLen).filter((el) => el.id !== selected.id)
    const pos = clampElementPosition(selResolved.position, w, selWallLen, others)
    if (pos === null) return
    updateElement(selected.wallId, selected.id, { width: w, position: pos })
  }

  const vb = `${-T - MARGIN + pan.x} ${-T - MARGIN + pan.y} ${W + 2 * T + 2 * MARGIN} ${Dp + 2 * T + 2 * MARGIN}`

  return (
    <div className="h-full flex min-h-0">
      {/* ── Palette ─────────────────────────────────────────────── */}
      <div className="w-44 shrink-0 bg-soft overflow-y-auto p-3 select-none">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Eshik va deraza</p>
        {/* Outer track, inner pill, raised icon disc. The track stays put and
            only the pill inside it takes the ink, so picking a tool reads as a
            switch being thrown rather than the whole row lighting up. */}
        <div className="flex flex-col gap-2">
          {TOOL_META.map((t) => (
            <button
              key={t.type}
              onClick={() => setTool(tool === t.type ? null : t.type)}
              className="flex w-full items-center gap-1.5 rounded-full bg-soft p-1.5 text-left shadow-soft-raised transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft-raised-lg active:shadow-soft-pressed focus-visible:outline-none focus-visible:shadow-soft-focus"
            >
              <span
                className={`min-w-0 flex-1 rounded-full px-2.5 py-1 transition-[box-shadow,background-color,color] duration-200 ${
                  tool === t.type
                    ? 'bg-soft-ink text-white shadow-soft-ink'
                    : 'bg-soft text-gray-800 shadow-soft-raised-sm'
                }`}
              >
                <span className="block truncate text-[11.5px] font-semibold leading-tight">{t.label}</span>
                <span className={`block truncate text-[9.5px] leading-tight ${tool === t.type ? 'text-white/60' : 'text-gray-400'}`}>{t.hint}</span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-soft shadow-soft-raised-sm">
                {t.type === 'eshik' && (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={ICON} strokeWidth="1.8">
                    <rect x="5" y="3" width="10" height="14" rx="1" />
                    <circle cx="12.4" cy="10" r="0.9" fill={ICON} />
                  </svg>
                )}
                {t.type === 'deraza' && (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={ICON} strokeWidth="1.8">
                    <rect x="3" y="5" width="14" height="10" rx="1" />
                    <path d="M10 5v10M3 10h14" />
                  </svg>
                )}
                {t.type === 'balkon' && (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={ICON} strokeWidth="1.8">
                    <rect x="3" y="3" width="8" height="14" rx="1" />
                    <rect x="12" y="3" width="5" height="14" rx="1" />
                    <path d="M12 10h5" />
                  </svg>
                )}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-gray-400">
          {tool ? "Devorga bosib joylashtiring. Elementni sudrab siljiting." : 'Element tanlang'}
          <br />O'ng tugmani bosib turib planni suring.
        </p>

        {/* ── Window types ───────────────────────────────────────── */}
        {selEl?.type === 'deraza' && selected ? (
          <div className="mt-4">
            <WindowStylePicker
              title="Deraza turi"
              value={resolveWindowStyle(selEl).id}
              onPick={(styleId) => updateElement(selected.wallId, selected.id, { styleId })}
              hint="Tanlangan deraza shu ko'rinishga o'zgaradi."
            />
          </div>
        ) : tool === 'deraza' ? (
          <div className="mt-4">
            <WindowStylePicker
              title="Deraza turi"
              value={newWindowStyle}
              onPick={setNewWindowStyle}
              hint="Yangi deraza shu turda qo'yiladi."
            />
          </div>
        ) : null}

        {/* ── Furniture standing in the room ─────────────────────── */}
        <p className="mt-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mebel</p>
        {furniture.length === 0 ? (
          <p className="text-[10px] leading-4 text-gray-400">
            3D oynada model qo'shing — plan ustida shakli chiziladi.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {furniture.map((f) => {
              const entry = resolveFurnitureEntry(f.furniture_id, userFurniture)
              const so = f.scaleOverride ?? 1
              return (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFur(selectedFur === f.id ? null : f.id); setSelected(null) }}
                  className="flex w-full items-center gap-1.5 rounded-full bg-soft p-1 text-left shadow-soft-raised transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft-raised-lg active:shadow-soft-pressed focus-visible:outline-none focus-visible:shadow-soft-focus"
                >
                  <span
                    className={`min-w-0 flex-1 rounded-full px-2.5 py-1 transition-[box-shadow,background-color,color] duration-200 ${
                      selectedFur === f.id
                        ? 'bg-soft-ink text-white shadow-soft-ink'
                        : 'bg-soft text-gray-800 shadow-soft-raised-sm'
                    }`}
                  >
                    <span className="block truncate text-[11px] font-semibold leading-tight">{entry?.name ?? 'Model'}</span>
                    <span className={`block truncate text-[9px] leading-tight tabular-nums ${selectedFur === f.id ? 'text-white/60' : 'text-gray-400'}`}>
                      {((entry?.sizeM.w ?? 0) * so).toFixed(2)}×{((entry?.sizeM.d ?? 0) * so).toFixed(2)} m
                    </span>
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft text-[13px] leading-none shadow-soft-raised-sm">
                    {entry?.emoji ?? '📦'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Plan ────────────────────────────────────────────────── */}
      {/* The sheet runs edge to edge and carries the vignette in CSS rather
          than in the SVG: a vignette drawn inside the viewBox would pan and
          zoom with the drawing, when what it should do is frame the viewport. */}
      <div
        className="relative flex-1 min-w-0 flex flex-col"
        style={{
          backgroundColor: C.canvas,
          backgroundImage: `radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)`,
        }}
      >
        <svg
          ref={svgRef}
          viewBox={vb}
          className="flex-1 min-h-0 w-full touch-none"
          onPointerDown={startPan}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Depth, drawn before anything else so it sits under the plan.
              The footprint casts a soft shadow onto the sheet and the wall
              band catches an ambient-occlusion halo where it meets the floor,
              which is what stops a flat two-tone drawing looking like a
              stencil. */}
          <defs>
            <filter id="plan-footprint-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy={T * 0.55} stdDeviation={T * 0.7} floodColor={C.footprintShadow} floodOpacity="1" />
            </filter>
            <filter id="plan-wall-ao" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={T * 0.22} />
            </filter>
            <pattern id="plan-hatch" width={planTheme.hatchGap} height={planTheme.hatchGap} patternUnits="userSpaceOnUse">
              <line x1={0} y1={0} x2={planTheme.hatchGap} y2={0} stroke={C.hatch} strokeWidth={LW.hatch} />
            </pattern>
          </defs>

          {/* The building's cast shadow. */}
          <rect
            x={-T} y={-T} width={W + 2 * T} height={Dp + 2 * T}
            fill={C.canvas} filter="url(#plan-footprint-shadow)" pointerEvents="none"
          />

          {/* floor */}
          <rect x={0} y={0} width={W} height={Dp} fill={C.floors[0]} />
          {floorHatch && (
            <rect x={0} y={0} width={W} height={Dp} fill="url(#plan-hatch)" pointerEvents="none" />
          )}
          {/* faint grid every metre */}
          {Array.from({ length: Math.floor(W / 1000) }, (_, i) => (
            <line key={`gx${i}`} x1={(i + 1) * 1000} y1={0} x2={(i + 1) * 1000} y2={Dp} stroke={C.grid} strokeWidth={LW.grid} strokeDasharray="60 60" />
          ))}
          {Array.from({ length: Math.floor(Dp / 1000) }, (_, i) => (
            <line key={`gy${i}`} x1={0} y1={(i + 1) * 1000} x2={W} y2={(i + 1) * 1000} stroke={C.grid} strokeWidth={LW.grid} strokeDasharray="60 60" />
          ))}

          {/* Ambient occlusion inside the room, hugging the wall faces. */}
          <rect
            x={LW.wallShadow / 2} y={LW.wallShadow / 2}
            width={W - LW.wallShadow} height={Dp - LW.wallShadow}
            fill="none" stroke={C.wallShadow} strokeWidth={LW.wallShadow}
            filter="url(#plan-wall-ao)" pointerEvents="none"
          />

          {/* walls: all four bars run the FULL outer span and overlap at the
              corners, so the frame always reads as one welded outline */}
          <rect x={-T} y={-T} width={W + 2 * T} height={T} fill={C.wallExterior} />
          <rect x={-T} y={Dp} width={W + 2 * T} height={T} fill={C.wallExterior} />
          <rect x={-T} y={-T} width={T} height={Dp + 2 * T} fill={C.wallExterior} />
          <rect x={W} y={-T} width={T} height={Dp + 2 * T} fill={C.wallExterior} />

          {/* A tonal seam down the middle of the band, reading as the wall's
              core, and a lit outer edge. Both are drawn as one inset frame
              each so the corners stay mitred rather than crossing. */}
          <rect
            x={-T / 2} y={-T / 2} width={W + T} height={Dp + T}
            fill="none" stroke={C.wallCore} strokeWidth={LW.wallCore} pointerEvents="none"
          />
          <rect
            x={-T + LW.wallHighlight / 2} y={-T + LW.wallHighlight / 2}
            width={W + 2 * T - LW.wallHighlight} height={Dp + 2 * T - LW.wallHighlight}
            fill="none" stroke={C.wallHighlight} strokeWidth={LW.wallHighlight} pointerEvents="none"
          />

          {/* per-wall hit areas + elements in local (u,v) space */}
          {walls.map((wall) => {
            const els = resolveElementPositions(
              geometry.walls.find((w) => w.id === wall.id)?.elements ?? [],
              wall.len,
            )
            return (
              <g key={wall.id} transform={wall.transform}>
                {/* generous invisible hit band for placing */}
                <rect
                  x={0} y={-160} width={wall.len} height={T + 380}
                  fill="transparent"
                  style={{ cursor: tool ? 'copy' : 'default' }}
                  onPointerDown={(e) => handleWallTap(wall, e)}
                />
                {els.map((el, i) => {
                  const isSel = selected?.id === el.id
                  const p = el.position
                  const w = el.width
                  return (
                    <g
                      key={el.id ?? `${wall.id}-${i}`}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => startDrag(wall, el, e)}
                    >
                      {/* opening */}
                      <rect x={p} y={0} width={w} height={T} fill={C.floors[0]} />
                        {/* Jambs: without them the opening reads as the wall
                            simply stopping, rather than as a framed hole. */}
                        <line x1={p} y1={0} x2={p} y2={T} stroke={C.windowStroke} strokeWidth={LW.opening} strokeLinecap="round" />
                        <line x1={p + w} y1={0} x2={p + w} y2={T} stroke={C.windowStroke} strokeWidth={LW.opening} strokeLinecap="round" />
                      {el.type === 'deraza' && (
                        <>
                          <line x1={p} y1={T * 0.35} x2={p + w} y2={T * 0.35} stroke={C.windowStroke} strokeWidth={LW.opening} />
                          <line x1={p} y1={T * 0.65} x2={p + w} y2={T * 0.65} stroke={C.windowStroke} strokeWidth={LW.opening} />
                          {/* mullions of the chosen window type, as a plan reads them */}
                          {(() => {
                            const n = mullionCount(resolveWindowStyle(el))
                            return Array.from({ length: n }, (_, k) => {
                              const x = p + (w / (n + 1)) * (k + 1)
                              return <line key={k} x1={x} y1={0} x2={x} y2={T} stroke={C.windowStroke} strokeWidth={LW.opening} />
                            })
                          })()}
                        </>
                      )}
                      {el.type === 'balkon' && (
                        <>
                          <line x1={p} y1={T * 0.5} x2={p + w} y2={T * 0.5} stroke={C.windowStroke} strokeWidth={LW.opening} />
                          <line x1={p + w * 0.55} y1={0} x2={p + w * 0.55} y2={T} stroke={C.windowStroke} strokeWidth={LW.opening} />
                        </>
                      )}
                      {el.type === 'eshik' && (
                        <>
                          {/* swing arc into the interior */}
                          <path
                            d={`M ${p} ${T + w} A ${w} ${w} 0 0 1 ${p + w} ${T}`}
                            fill="none" stroke={C.doorStroke} strokeWidth={LW.doorSwing} strokeLinecap="round"
                          />
                          <line x1={p} y1={T} x2={p} y2={T + w} stroke={C.doorStroke} strokeWidth={LW.doorLeaf} strokeLinecap="round" />
                        </>
                      )}
                      {isSel && (
                        <rect
                          x={p - 40} y={-40} width={w + 80} height={T + 80}
                          fill="none" stroke={SELECT} strokeWidth={LW.selection} rx={40}
                        />
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* The room's own name, set the way a presentation plan sets it:
              uppercase, tracked out, and printed on the floor — drawn before
              the furniture so anything standing on it passes over the top,
              the way it would on a real sheet. */}
          {roomName && (
            <text
              x={W / 2} y={Dp / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill={C.label} fontFamily={TY.family}
              fontSize={TY.labelSize} fontWeight={TY.labelWeight}
              letterSpacing={TY.labelTracking}
              pointerEvents="none"
            >
              {roomName.toUpperCase()}
            </text>
          )}

          {/* furniture standing in the room, drawn as top-down silhouettes */}
          <PlanFurnitureLayer
            furniture={furniture}
            userFurniture={userFurniture}
            W={W}
            Dp={Dp}
            selectedId={selectedFur}
            onHull={onHull}
            onPointerDownItem={startFurnitureDrag}
          />

          {/* dimension chain for the selected element */}
          {selected && selResolved && (
            <DimRuler
              wallId={selected.wallId}
              len={selWallLen}
              p={selResolved.position}
              w={selResolved.width}
              W={W}
              Dp={Dp}
            />
          )}

          {/* labels + dimensions */}
          <g fill={C.label} fontFamily={TY.family} fontWeight={TY.labelWeight}>
            <text x={W / 2} y={-T - 240} textAnchor="middle" fontSize={TY.wallLetterSize}>A</text>
            <text x={W / 2} y={-T - 20} textAnchor="middle" fontSize={TY.dimensionSize}>{(W / 1000).toFixed(1)} m</text>
            <text x={W / 2} y={Dp + T + 380} textAnchor="middle" fontSize={TY.wallLetterSize}>C</text>
            <text x={W + T + 240} y={Dp / 2} textAnchor="start" fontSize={TY.wallLetterSize} dominantBaseline="middle">B</text>
            <text x={-T - 240} y={Dp / 2} textAnchor="end" fontSize={TY.wallLetterSize} dominantBaseline="middle">D</text>
            <text
              x={-T - 60} y={Dp / 2} fontSize={TY.dimensionSize} textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(-90 ${-T - 60} ${Dp / 2})`}
            >
              {(Dp / 1000).toFixed(1)} m
            </text>
          </g>
        </svg>

        {/* ── Inspector for the selected element ─────────────────── */}
        {selEl && selected && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-600">
              {selEl.type === 'eshik' ? 'Eshik' : selEl.type === 'deraza' ? 'Deraza' : 'Balkon'} · {selected.wallId}
            </span>
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              Eni
              <MmInput
                value={selEl.width}
                onCommit={setSelectedWidth}
                min={200}
                max={selWallLen - 2 * CORNER_MARGIN}
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              Bo'yi
              <MmInput
                value={selEl.height}
                onCommit={(v) => updateElement(selected.wallId, selected.id, { height: v })}
                min={100}
              />
            </label>
            {selEl.type === 'deraza' && (
              <label className="flex items-center gap-1 text-[11px] text-gray-500">
                Pol-dan
                <MmInput
                  value={selEl.sill_height}
                  onCommit={(v) => updateElement(selected.wallId, selected.id, { sill_height: v })}
                  min={0}
                />
              </label>
            )}
            {selResolved && (
              <>
                {/* exact distances from the wall edges (mm) */}
                <label className="flex items-center gap-1 text-[11px] text-gray-500">
                  Chapdan
                  <MmInput
                    step={10}
                    value={selResolved.position}
                    onCommit={setSelectedPos}
                    min={0}
                    max={selWallLen}
                  />
                </label>
                <label className="flex items-center gap-1 text-[11px] text-gray-500">
                  O'ngdan
                  <MmInput
                    step={10}
                    value={selWallLen - selResolved.position - selResolved.width}
                    onCommit={(v) => setSelectedPos(selWallLen - selResolved.width - v)}
                    min={0}
                    max={selWallLen}
                  />
                </label>
                {/* nudge buttons, 50mm per tap */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedPos(selResolved.position - 50)}
                    title="Chapga surish (50mm)"
                    className="w-7 h-7 rounded-[30%] text-gray-600 text-sm font-bold bg-soft shadow-soft-raised-sm hover:shadow-soft-raised active:shadow-soft-pressed"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => setSelectedPos(selResolved.position + 50)}
                    title="O'ngga surish (50mm)"
                    className="w-7 h-7 rounded-[30%] text-gray-600 text-sm font-bold bg-soft shadow-soft-raised-sm hover:shadow-soft-raised active:shadow-soft-pressed"
                  >
                    ▶
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => { removeElement(selected.wallId, selected.id); setSelected(null) }}
              className="ml-auto text-[11px] font-semibold rounded-full px-2.5 py-1 text-[#C0362F] bg-soft shadow-soft-raised-sm hover:shadow-soft-raised active:shadow-soft-pressed"
            >
              O'chirish
            </button>
          </div>
        )}

        {/* ── Inspector for the selected furniture ───────────────── */}
        {selFur && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-600 truncate max-w-[40%]">
              {selFurEntry?.emoji ?? '📦'} {selFurEntry?.name ?? 'Model'}
            </span>
            <span className="text-[10px] text-gray-400 tabular-nums">
              {((selFurEntry?.sizeM.w ?? 0) * (selFur.scaleOverride ?? 1)).toFixed(2)}×
              {((selFurEntry?.sizeM.d ?? 0) * (selFur.scaleOverride ?? 1)).toFixed(2)} m
            </span>
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              Burish°
              <MmInput
                step={15}
                min={0}
                max={360}
                value={Math.round(((selFur.rotation * 180) / Math.PI + 360) % 360)}
                onCommit={setFurnitureRotation}
              />
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFurnitureRotation(((selFur.rotation * 180) / Math.PI) - 15)}
                title="15° chapga burish"
                className="w-7 h-7 rounded-[30%] text-gray-600 text-sm font-bold bg-soft shadow-soft-raised-sm hover:shadow-soft-raised active:shadow-soft-pressed"
              >
                ↺
              </button>
              <button
                onClick={() => setFurnitureRotation(((selFur.rotation * 180) / Math.PI) + 15)}
                title="15° o'ngga burish"
                className="w-7 h-7 rounded-[30%] text-gray-600 text-sm font-bold bg-soft shadow-soft-raised-sm hover:shadow-soft-raised active:shadow-soft-pressed"
              >
                ↻
              </button>
            </div>
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              O'lcham %
              <MmInput
                step={5}
                min={10}
                max={500}
                value={Math.round((selFur.scaleOverride ?? 1) * 100)}
                onCommit={setFurnitureScale}
              />
            </label>
            <button
              onClick={() => { removeFurniture(selFur.id); setSelectedFur(null) }}
              className="ml-auto text-[11px] font-semibold rounded-full px-2.5 py-1 text-[#C0362F] bg-soft shadow-soft-raised-sm hover:shadow-soft-raised active:shadow-soft-pressed"
            >
              O'chirish
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
