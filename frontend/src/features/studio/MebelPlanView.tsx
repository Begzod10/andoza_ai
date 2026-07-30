/**
 * 2D floor-plan editor for the Mebelirovka tab.
 *
 * Left palette: selectable door/window/balcony-door tools (elektr-sidebar
 * style). Clicking a wall in the plan places the selected element there;
 * existing elements can be dragged along their wall, selected, resized via
 * the inspector row, and deleted. All edits go straight to the room store,
 * so the 3D viewport next to this view updates live.
 */
import { useRef, useState } from 'react'
import { useRoomStore } from '@/store/roomStore'
import type { WallElement } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'

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

const BLUE = '#1E3A8A'
const WALL_DARK = '#2B2622'
const FLOOR_FILL = '#F0EDE5'
const SELECT = '#D85A30'

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
        const color = isEl ? SELECT : '#6B665C'
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

export function MebelPlanView() {
  const geometry = useRoomStore((s) => s.geometry)
  const addElement = useRoomStore((s) => s.addElement)
  const updateElement = useRoomStore((s) => s.updateElement)
  const removeElement = useRoomStore((s) => s.removeElement)

  const [tool, setTool] = useState<ElType | null>('eshik')
  const [selected, setSelected] = useState<{ wallId: string; id: string } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ wallId: string; id: string; grabOffset: number; uAxis: 'x' | 'y'; len: number; width: number } | null>(null)
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

  function startPan(e: React.PointerEvent<SVGSVGElement>) {
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
    addElement(wall.id, { ...def, position: pos })
    setSelected(null)
  }

  function startDrag(wall: WallDef, el: WallElement, e: React.PointerEvent) {
    if (e.button !== 0) return
    e.stopPropagation()
    setSelected({ wallId: wall.id, id: el.id })
    const u = wallU(wall, e.clientX, e.clientY)
    dragRef.current = {
      wallId: wall.id,
      id: el.id,
      grabOffset: u - el.position,
      uAxis: wall.uAxis,
      len: wall.len,
      width: el.width,
    }
    ;(e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId)
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
      <div className="w-40 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3 select-none">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Eshik va deraza</p>
        <div className="flex flex-col gap-2">
          {TOOL_META.map((t) => (
            <button
              key={t.type}
              onClick={() => setTool(tool === t.type ? null : t.type)}
              className={`flex items-center gap-2.5 p-2 rounded-xl border-2 text-left transition-colors ${
                tool === t.type ? 'border-blue-700 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="w-9 h-9 shrink-0 rounded-lg border-2 flex items-center justify-center" style={{ borderColor: BLUE }}>
                {t.type === 'eshik' && (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={BLUE} strokeWidth="1.8">
                    <rect x="5" y="3" width="10" height="14" rx="1" />
                    <circle cx="12.4" cy="10" r="0.9" fill={BLUE} />
                  </svg>
                )}
                {t.type === 'deraza' && (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={BLUE} strokeWidth="1.8">
                    <rect x="3" y="5" width="14" height="10" rx="1" />
                    <path d="M10 5v10M3 10h14" />
                  </svg>
                )}
                {t.type === 'balkon' && (
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke={BLUE} strokeWidth="1.8">
                    <rect x="3" y="3" width="8" height="14" rx="1" />
                    <rect x="12" y="3" width="5" height="14" rx="1" />
                    <path d="M12 10h5" />
                  </svg>
                )}
              </span>
              <span>
                <span className="block text-[12px] font-semibold text-gray-800">{t.label}</span>
                <span className="block text-[10px] text-gray-400">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-gray-400">
          {tool ? "Devorga bosib joylashtiring. Elementni sudrab siljiting." : 'Element tanlang'}
          <br />O'ng tugmani bosib turib planni suring.
        </p>
      </div>

      {/* ── Plan ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
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
          {/* floor */}
          <rect x={0} y={0} width={W} height={Dp} fill={FLOOR_FILL} />
          {/* faint grid every metre */}
          {Array.from({ length: Math.floor(W / 1000) }, (_, i) => (
            <line key={`gx${i}`} x1={(i + 1) * 1000} y1={0} x2={(i + 1) * 1000} y2={Dp} stroke="#DDD8CC" strokeWidth={12} strokeDasharray="60 60" />
          ))}
          {Array.from({ length: Math.floor(Dp / 1000) }, (_, i) => (
            <line key={`gy${i}`} x1={0} y1={(i + 1) * 1000} x2={W} y2={(i + 1) * 1000} stroke="#DDD8CC" strokeWidth={12} strokeDasharray="60 60" />
          ))}

          {/* walls: all four bars run the FULL outer span and overlap at the
              corners, so the frame always reads as one welded outline */}
          <rect x={-T} y={-T} width={W + 2 * T} height={T} fill={WALL_DARK} />
          <rect x={-T} y={Dp} width={W + 2 * T} height={T} fill={WALL_DARK} />
          <rect x={-T} y={-T} width={T} height={Dp + 2 * T} fill={WALL_DARK} />
          <rect x={W} y={-T} width={T} height={Dp + 2 * T} fill={WALL_DARK} />

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
                      <rect x={p} y={0} width={w} height={T} fill="#FFFFFF" />
                      {el.type === 'deraza' && (
                        <>
                          <line x1={p} y1={T * 0.35} x2={p + w} y2={T * 0.35} stroke={BLUE} strokeWidth={40} />
                          <line x1={p} y1={T * 0.65} x2={p + w} y2={T * 0.65} stroke={BLUE} strokeWidth={40} />
                        </>
                      )}
                      {el.type === 'balkon' && (
                        <>
                          <line x1={p} y1={T * 0.5} x2={p + w} y2={T * 0.5} stroke={BLUE} strokeWidth={40} />
                          <line x1={p + w * 0.55} y1={0} x2={p + w * 0.55} y2={T} stroke={BLUE} strokeWidth={40} />
                        </>
                      )}
                      {el.type === 'eshik' && (
                        <>
                          {/* swing arc into the interior */}
                          <path
                            d={`M ${p} ${T + w} A ${w} ${w} 0 0 1 ${p + w} ${T}`}
                            fill="none" stroke="#A89F8D" strokeWidth={26} strokeDasharray="80 60"
                          />
                          <line x1={p} y1={T} x2={p} y2={T + w} stroke={WALL_DARK} strokeWidth={50} />
                        </>
                      )}
                      {isSel && (
                        <rect
                          x={p - 40} y={-40} width={w + 80} height={T + 80}
                          fill="none" stroke={SELECT} strokeWidth={44} rx={40}
                        />
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}

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
          <g fill="#8A857A" fontFamily="ui-sans-serif, system-ui" fontWeight={600}>
            <text x={W / 2} y={-T - 240} textAnchor="middle" fontSize={260}>A</text>
            <text x={W / 2} y={-T - 20} textAnchor="middle" fontSize={200}>{(W / 1000).toFixed(1)} m</text>
            <text x={W / 2} y={Dp + T + 380} textAnchor="middle" fontSize={260}>C</text>
            <text x={W + T + 240} y={Dp / 2} textAnchor="start" fontSize={260} dominantBaseline="middle">B</text>
            <text x={-T - 240} y={Dp / 2} textAnchor="end" fontSize={260} dominantBaseline="middle">D</text>
            <text
              x={-T - 60} y={Dp / 2} fontSize={200} textAnchor="middle" dominantBaseline="middle"
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
                    className="w-7 h-7 rounded-lg border border-gray-300 text-gray-600 text-sm font-bold hover:bg-gray-100 active:scale-95"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => setSelectedPos(selResolved.position + 50)}
                    title="O'ngga surish (50mm)"
                    className="w-7 h-7 rounded-lg border border-gray-300 text-gray-600 text-sm font-bold hover:bg-gray-100 active:scale-95"
                  >
                    ▶
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => { removeElement(selected.wallId, selected.id); setSelected(null) }}
              className="ml-auto text-[11px] font-semibold text-red-600 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50"
            >
              O'chirish
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
