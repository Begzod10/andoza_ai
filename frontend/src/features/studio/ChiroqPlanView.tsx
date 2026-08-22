/**
 * 2D lighting plan for the Chiroqlar tab — the reflected ceiling plan.
 *
 * This is where a fixture actually gets positioned: pick a type in the palette
 * and click the exact spot, drag a placed fixture to nudge it, or type its
 * coordinates for a dimension you have to hit exactly. The 3D viewport beside
 * it renders the same store, so both move together.
 *
 * Furniture is drawn underneath, dimmed: a pendant belongs over the table and
 * a bra beside the bed, so the thing you are aiming at has to be visible.
 * Wall fixtures snap onto whichever wall was clicked, since they cannot hang
 * in mid-air.
 */
import { useRef, useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { useRoomStore } from '@/store/roomStore'
import type { PlacedLight, PlacedFurniture } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'
import { PlanFurnitureLayer } from './PlanFurniture'
import type { Hull } from '@/lib/modelFootprint'
import { lightType, kelvinToHex, type LightType, type LightTypeId } from '@/lib/lightCatalog'
import { planTheme } from './planTheme'

const T = 250        // wall thickness in plan, mm
const MARGIN = 520   // viewBox margin, mm
// Same sheet as the furniture plan — see planTheme.ts. Fixtures keep their own
// warm colour: a lamp's colour temperature is data the drawing is *about*, not
// presentation, so it is the one thing the theme does not override.
const { palette: C, weights: LW, type: TY } = planTheme
const WALL_DARK = C.wallExterior
const FLOOR_FILL = C.floors[0]
const BLUE = C.selection
/** Click/drag placement snaps to this grid, in mm. */
const SNAP = 50
/** How close to a wall a click has to land to count as "on that wall". */
const WALL_BAND = 450

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const snap = (mm: number) => Math.round(mm / SNAP) * SNAP

/** Nearest wall to a plan point, or null when the point is out in the room. */
function nearestWall(x: number, z: number, W: number, D: number): 'A' | 'B' | 'C' | 'D' | null {
  const d = [
    { id: 'A' as const, dist: z },
    { id: 'C' as const, dist: D - z },
    { id: 'D' as const, dist: x },
    { id: 'B' as const, dist: W - x },
  ].sort((a, b) => a.dist - b.dist)[0]
  return d.dist <= WALL_BAND ? d.id : null
}

export function ChiroqPlanView({
  armedType,
  onPlaced,
  selectedId,
  onSelect,
}: {
  /** Fixture the next click places, or null when the plan is in select mode. */
  armedType: LightTypeId | null
  onPlaced: () => void
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const geometry = useRoomStore((s) => s.geometry)
  const furniture = useRoomStore((s) => s.furniture)
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const lights = useRoomStore((s) => s.lights)
  const addLight = useRoomStore((s) => s.addLight)
  const moveLight = useRoomStore((s) => s.moveLight)
  const updateLight = useRoomStore((s) => s.updateLight)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{ id: string; offX: number; offZ: number } | null>(null)
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null)
  const hullsRef = useRef<Map<string, Hull>>(new Map())
  const onHull = useCallback((id: string, hull: Hull) => { hullsRef.current.set(id, hull) }, [])

  const wallA = geometry.walls.find((w) => w.id === 'A')
  const wallB = geometry.walls.find((w) => w.id === 'B')
  if (!wallA || !wallB || geometry.walls.length !== 4) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500 p-6 text-center">
        2D chiroq rejasi faqat to'rtburchak (A-B-C-D) xonalar uchun mavjud
      </div>
    )
  }

  const W = wallA.length
  const D = wallB.length
  const vb = `${-T - MARGIN} ${-T - MARGIN} ${W + 2 * T + 2 * MARGIN} ${D + 2 * T + 2 * MARGIN}`

  function planPoint(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, z: 0 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, z: 0 }
    const p = pt.matrixTransform(m.inverse())
    return { x: p.x, z: p.y }
  }

  /** Place the armed fixture at the clicked point. */
  function placeAt(clientX: number, clientY: number) {
    if (!armedType) return
    const t = lightType(armedType)
    const p = planPoint(clientX, clientY)
    const x = clamp(snap(p.x), 0, W)
    const z = clamp(snap(p.z), 0, D)

    const light: PlacedLight = { id: nanoid(), type: t.id, xMm: x, zMm: z }
    if (t.mount === 'wall') {
      // A wall fixture goes on whichever wall the click was nearest, and sits
      // flush with it rather than wherever the pointer happened to land.
      const wall = nearestWall(x, z, W, D) ?? 'A'
      light.wallId = wall
      if (wall === 'A') light.zMm = 0
      if (wall === 'C') light.zMm = D
      if (wall === 'D') light.xMm = 0
      if (wall === 'B') light.xMm = W
    }
    addLight(light)
    onSelect(light.id)
    onPlaced()
  }

  function startDrag(l: PlacedLight, e: React.PointerEvent) {
    e.stopPropagation()
    onSelect(l.id)
    const p = planPoint(e.clientX, e.clientY)
    dragRef.current = { id: l.id, offX: p.x - l.xMm, offZ: p.z - l.zMm }
    svgRef.current?.setPointerCapture?.(e.pointerId)
  }

  function handleMove(e: React.PointerEvent) {
    const p = planPoint(e.clientX, e.clientY)
    setHover(armedType ? { x: clamp(snap(p.x), 0, W), z: clamp(snap(p.z), 0, D) } : null)

    const d = dragRef.current
    if (!d) return
    const l = lights.find((x) => x.id === d.id)
    if (!l) return
    const t = lightType(l.type)
    let x = clamp(snap(p.x - d.offX), 0, W)
    let z = clamp(snap(p.z - d.offZ), 0, D)
    // A wall fixture slides along its own wall instead of leaving it
    if (t.mount === 'wall') {
      const wall = l.wallId ?? 'A'
      if (wall === 'A') z = 0
      if (wall === 'C') z = D
      if (wall === 'D') x = 0
      if (wall === 'B') x = W
    }
    moveLight(d.id, x, z)
  }

  const endDrag = () => { dragRef.current = null }
  const selected = lights.find((l) => l.id === selectedId) ?? null

  return (
    <div className="h-full flex flex-col">
      {/* ── Status strip: what a click will do right now ─────────── */}
      <div className="shrink-0 px-3 py-2 bg-soft">
        {armedType ? (
          <p className="text-[11px] font-semibold text-brand flex items-center gap-1.5">
            <span>{lightType(armedType).emoji}</span>
            {lightType(armedType).name} — rejada joyni bosing
          </p>
        ) : (
          <p className="text-[11px] text-gray-400">
            O'ngdagi ro'yxatdan chiroq turini tanlang, so'ng rejada aniq joyni bosing.
            Qo'yilgan chiroqni sudrab suring.
          </p>
        )}
      </div>

        {/* Same dark sheet as the furniture plan; the vignette is CSS so it
            frames the viewport rather than panning with the drawing. */}
        <div
          className="relative flex-1 min-h-0 flex flex-col"
          style={{
            backgroundColor: C.canvas,
            backgroundImage: `radial-gradient(120% 90% at 50% 45%, transparent 45%, rgba(0,0,0,0.55) 100%)`,
          }}
        >
      <svg
        ref={svgRef}
        viewBox={vb}
        className="flex-1 min-h-0 w-full touch-none"
        style={{ cursor: armedType ? 'copy' : 'default' }}
        onPointerDown={(e) => { if (armedType) placeAt(e.clientX, e.clientY); else onSelect(null) }}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerLeave={() => { endDrag(); setHover(null) }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <rect x={0} y={0} width={W} height={D} fill={FLOOR_FILL} />

        {/* metre grid — the reference for "exactly here" */}
        {Array.from({ length: Math.max(0, Math.floor(W / 1000)) }, (_, i) => (
          <line key={`gx${i}`} x1={(i + 1) * 1000} y1={0} x2={(i + 1) * 1000} y2={D}
                stroke={C.grid} strokeWidth={LW.grid} strokeDasharray="60 60" />
        ))}
        {Array.from({ length: Math.max(0, Math.floor(D / 1000)) }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={(i + 1) * 1000} x2={W} y2={(i + 1) * 1000}
                stroke={C.grid} strokeWidth={LW.grid} strokeDasharray="60 60" />
        ))}

        {/* walls */}
        <rect x={-T} y={-T} width={W + 2 * T} height={T} fill={WALL_DARK} />
        <rect x={-T} y={D} width={W + 2 * T} height={T} fill={WALL_DARK} />
        <rect x={-T} y={-T} width={T} height={D + 2 * T} fill={WALL_DARK} />
        <rect x={W} y={-T} width={T} height={D + 2 * T} fill={WALL_DARK} />

        {/* openings, as pale gaps — orientation cues for aiming a fixture */}
        <OpeningMarks geometry={geometry} W={W} D={D} />

        {/* furniture, dimmed: what the light is actually for */}
        <g opacity={0.35} style={{ pointerEvents: 'none' }}>
          <PlanFurnitureLayer
            furniture={furniture as PlacedFurniture[]}
            userFurniture={userFurniture}
            W={W}
            Dp={D}
            selectedId={null}
            onHull={onHull}
            onPointerDownItem={() => {}}
          />
        </g>

        {/* centre guides — the usual "centre it on the room" case */}
        <line x1={W / 2} y1={0} x2={W / 2} y2={D} stroke={BLUE} strokeWidth={6} strokeDasharray="40 60" opacity={0.25} />
        <line x1={0} y1={D / 2} x2={W} y2={D / 2} stroke={BLUE} strokeWidth={6} strokeDasharray="40 60" opacity={0.25} />

        {/* placed fixtures */}
        {lights.map((l) => (
          <LightGlyph
            key={l.id}
            light={l}
            selected={l.id === selectedId}
            onPointerDown={(e) => startDrag(l, e)}
          />
        ))}

        {/* ghost of what is about to be placed */}
        {armedType && hover && (
          <g style={{ pointerEvents: 'none' }} opacity={0.75}>
            <circle cx={hover.x} cy={hover.z} r={190} fill={kelvinToHex(lightType(armedType).colorK)} opacity={0.3} />
            <circle cx={hover.x} cy={hover.z} r={90} fill="none" stroke={BLUE} strokeWidth={18} />
            <line x1={hover.x - 150} y1={hover.z} x2={hover.x + 150} y2={hover.z} stroke={BLUE} strokeWidth={14} />
            <line x1={hover.x} y1={hover.z - 150} x2={hover.x} y2={hover.z + 150} stroke={BLUE} strokeWidth={14} />
            <text x={hover.x + 220} y={hover.z - 120} fontSize={190} fill={BLUE} fontWeight="700">
              {(hover.x / 1000).toFixed(2)} / {(hover.z / 1000).toFixed(2)}
            </text>
          </g>
        )}

        {/* room dimensions */}
        <text x={W / 2} y={-T - 150} fontSize={TY.dimensionSize} fill={C.dimension} textAnchor="middle">
          {(W / 1000).toFixed(1)} m
        </text>
        <text x={-T - 150} y={D / 2} fontSize={TY.dimensionSize} fill={C.dimension} textAnchor="middle"
              transform={`rotate(-90 ${-T - 150} ${D / 2})`}>
          {(D / 1000).toFixed(1)} m
        </text>
      </svg>
        </div>

      {/* ── Exact coordinates for the selected fixture ───────────── */}
      {selected && (
        <CoordinateBar
          light={selected}
          W={W}
          D={D}
          onMove={(x, z) => moveLight(selected.id, x, z)}
          onPatch={(patch) => updateLight(selected.id, patch)}
        />
      )}
    </div>
  )
}

/** Plan symbol for one fixture: a glow, the mount's outline, and its emoji. */
function LightGlyph({ light, selected, onPointerDown }: {
  light: PlacedLight
  selected: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const t: LightType = lightType(light.type)
  const hex = kelvinToHex(light.colorK ?? t.colorK)
  const r = Math.max(160, (Math.max(t.sizeM.w, t.sizeM.d) * 1000) / 2)
  const dim = light.off

  return (
    <g style={{ cursor: 'grab' }} onPointerDown={onPointerDown}>
      {/* spill — a rough sense of how far the fixture throws */}
      <circle cx={light.xMm} cy={light.zMm} r={r * 3.2} fill={hex} opacity={dim ? 0.04 : 0.13} />
      <circle cx={light.xMm} cy={light.zMm} r={r} fill={dim ? C.furnitureDetail : hex} stroke={WALL_DARK} strokeWidth={14} />
      {/* linear fixtures read as a bar, not a dot */}
      {(t.id === 'led_linear' || t.id === 'track' || t.id === 'led_track' || t.id === 'bath') && (
        <rect
          x={light.xMm - (t.sizeM.w * 1000) / 2}
          y={light.zMm - 45}
          width={t.sizeM.w * 1000}
          height={90}
          fill={dim ? C.furnitureDetail : hex}
          stroke={WALL_DARK}
          strokeWidth={12}
          transform={`rotate(${((light.rotation ?? 0) * 180) / Math.PI} ${light.xMm} ${light.zMm})`}
        />
      )}
      {selected && (
        <circle cx={light.xMm} cy={light.zMm} r={r + 120} fill="none" stroke={BLUE} strokeWidth={26} strokeDasharray="70 50" />
      )}
      <text x={light.xMm} y={light.zMm + 70} fontSize={190} textAnchor="middle" style={{ pointerEvents: 'none' }}>
        {t.emoji}
      </text>
    </g>
  )
}

/** Pale marks where the openings are, so a fixture can be lined up with them. */
function OpeningMarks({ geometry, W, D }: {
  geometry: ReturnType<typeof useRoomStore.getState>['geometry']
  W: number
  D: number
}) {
  const defs: Array<{ id: string; len: number; toXY: (p: number, w: number) => { x: number; y: number; horiz: boolean } }> = [
    { id: 'A', len: W, toXY: (p, w) => ({ x: p + w / 2, y: -T / 2, horiz: true }) },
    { id: 'C', len: W, toXY: (p, w) => ({ x: p + w / 2, y: D + T / 2, horiz: true }) },
    { id: 'B', len: D, toXY: (p, w) => ({ x: W + T / 2, y: p + w / 2, horiz: false }) },
    { id: 'D', len: D, toXY: (p, w) => ({ x: -T / 2, y: p + w / 2, horiz: false }) },
  ]
  return (
    <g style={{ pointerEvents: 'none' }}>
      {defs.map((wd) => {
        const wall = geometry.walls.find((w) => w.id === wd.id)
        if (!wall) return null
        return resolveElementPositions(wall.elements, wd.len).map((el) => {
          const { x, y, horiz } = wd.toXY(el.position, el.width)
          const isWindow = el.type !== 'eshik'
          return (
            <rect
              key={`${wd.id}-${el.id ?? el.position}`}
              x={x - (horiz ? el.width / 2 : T / 2)}
              y={y - (horiz ? T / 2 : el.width / 2)}
              width={horiz ? el.width : T}
              height={horiz ? T : el.width}
              fill={isWindow ? C.windowStroke : C.doorStroke}
            />
          )
        })
      })}
    </g>
  )
}

/** Numeric position for the selected fixture — for dimensions that must be exact. */
function CoordinateBar({ light, W, D, onMove, onPatch }: {
  light: PlacedLight
  W: number
  D: number
  onMove: (x: number, z: number) => void
  onPatch: (patch: Partial<Omit<PlacedLight, 'id'>>) => void
}) {
  const t = lightType(light.type)
  return (
    <div className="shrink-0 bg-soft px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1">
        <span>{t.emoji}</span>{t.name}
      </span>
      <NumField label="X" value={light.xMm} min={0} max={W} onCommit={(v) => onMove(v, light.zMm)} />
      <NumField label="Y" value={light.zMm} min={0} max={D} onCommit={(v) => onMove(light.xMm, v)} />
      <button
        onClick={() => onMove(Math.round(W / 2), Math.round(D / 2))}
        className="text-[10px] font-semibold text-gray-500 hover:text-brand px-2 py-1 rounded-md border border-gray-200"
      >
        Markazga
      </button>
      <button
        onClick={() => onPatch({ off: !light.off })}
        className={`text-[10px] font-bold px-2 py-1 rounded-md ${
          light.off ? 'bg-soft-deep text-gray-500 shadow-soft-pressed' : 'bg-amber-100 text-amber-700'
        }`}
      >
        {light.off ? "O'chiq" : 'Yoqilgan'}
      </button>
    </div>
  )
}

/** mm input that only commits a valid, in-range number. */
function NumField({ label, value, min, max, onCommit }: {
  label: string
  value: number
  min: number
  max: number
  onCommit: (mm: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(Math.round(value))

  function commit() {
    if (draft === null) return
    const n = parseFloat(draft)
    if (!isNaN(n)) onCommit(Math.round(clamp(n, min, max)))
    setDraft(null)
  }

  return (
    <label className="flex items-center gap-1">
      <span className="text-[10px] font-semibold text-gray-400">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(String(Math.round(value))); e.currentTarget.select() }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-16 px-2 py-1 text-[11px] rounded-lg bg-soft shadow-soft-pressed focus:shadow-soft-pressed-deep focus:outline-none"
      />
      <span className="text-[9px] text-gray-400">mm</span>
    </label>
  )
}
