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

export function MebelPlanView() {
  const geometry = useRoomStore((s) => s.geometry)
  const addElement = useRoomStore((s) => s.addElement)
  const updateElement = useRoomStore((s) => s.updateElement)
  const removeElement = useRoomStore((s) => s.removeElement)

  const [tool, setTool] = useState<ElType | null>('eshik')
  const [selected, setSelected] = useState<{ wallId: string; id: string } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ wallId: string; id: string; grabOffset: number; uAxis: 'x' | 'y'; len: number; width: number } | null>(null)

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

  function handleWallTap(wall: WallDef, e: React.PointerEvent) {
    if (!tool) return
    const def = DEFAULTS[tool]
    const u = wallU(wall, e.clientX, e.clientY)
    const pos = Math.round(Math.min(Math.max(u - def.width / 2, 0), wall.len - def.width))
    addElement(wall.id, { ...def, position: pos })
    setSelected(null)
  }

  function startDrag(wall: WallDef, el: WallElement, e: React.PointerEvent) {
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
    const d = dragRef.current
    if (!d) return
    const p = svgPointFromClient(e.clientX, e.clientY)
    const u = d.uAxis === 'x' ? p.x : p.y
    const pos = Math.round(Math.min(Math.max(u - d.grabOffset, 0), d.len - d.width))
    updateElement(d.wallId, d.id, { position: pos })
  }

  function endDrag() {
    dragRef.current = null
  }

  const selEl = selected
    ? geometry.walls.find((w) => w.id === selected.wallId)?.elements.find((e) => e.id === selected.id)
    : null

  const vb = `${-T - MARGIN} ${-T - MARGIN} ${W + 2 * T + 2 * MARGIN} ${Dp + 2 * T + 2 * MARGIN}`

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
        </p>
      </div>

      {/* ── Plan ────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <svg
          ref={svgRef}
          viewBox={vb}
          className="flex-1 min-h-0 w-full touch-none"
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
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

          {/* walls: horizontal (A/C) span the full outer width; B/D sit between them */}
          <rect x={-T} y={-T} width={W + 2 * T} height={T} fill={WALL_DARK} />
          <rect x={-T} y={Dp} width={W + 2 * T} height={T} fill={WALL_DARK} />
          <rect x={-T} y={0} width={T} height={Dp} fill={WALL_DARK} />
          <rect x={W} y={0} width={T} height={Dp} fill={WALL_DARK} />

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
                {els.map((el) => {
                  const isSel = selected?.id === el.id
                  const p = el.position
                  const w = el.width
                  return (
                    <g
                      key={el.id}
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
            {([['Eni', 'width'], ['Bo\'yi', 'height']] as const).map(([label, key]) => (
              <label key={key} className="flex items-center gap-1 text-[11px] text-gray-500">
                {label}
                <input
                  type="number" step={50}
                  value={selEl[key]}
                  onChange={(e) => updateElement(selected.wallId, selected.id, { [key]: Number(e.target.value) || 0 })}
                  className="w-16 border border-gray-300 rounded px-1 py-0.5 text-[11px] text-gray-800"
                />
              </label>
            ))}
            {selEl.type === 'deraza' && (
              <label className="flex items-center gap-1 text-[11px] text-gray-500">
                Pol-dan
                <input
                  type="number" step={50}
                  value={selEl.sill_height}
                  onChange={(e) => updateElement(selected.wallId, selected.id, { sill_height: Number(e.target.value) || 0 })}
                  className="w-16 border border-gray-300 rounded px-1 py-0.5 text-[11px] text-gray-800"
                />
              </label>
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
