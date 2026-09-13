/**
 * Hand-drawn room shape — the 4th "Yangi loyiha" entry point.
 *
 * Tap out the room's corners on a grid-snapped canvas; once the shape is
 * closed it feeds into the exact same downstream pipeline the LiDAR scan
 * uses (see LidarPage.tsx): build a RoomGeometry, loadRoom() it into the
 * store, then hand off to the wizard's existing per-wall review steps.
 *
 * Coordinate transform and the tap-to-place idiom mirror
 * ChiroqPlanView.tsx's svgPointFromClient/placeAt pattern; header chrome
 * mirrors LidarPage.tsx/Photo360Page.tsx's full-screen dark scan flows.
 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoomStore } from '@/store/roomStore'

type Point = [number, number] // [x, z] mm, already snapped to SNAP_MM

/** Visual grid spacing — every 1m line is drawn and labeled. */
const GRID_MM = 1000
/** Placed points snap to this resolution — finer than the visible grid. */
const SNAP_MM = 100
/** Fixed logical drawing area (square), mm. Comfortably covers real rooms. */
const CANVAS_MM = 8000
/** Screen-pixel radius that counts as "tapped the first point" to close the shape. */
const CLOSE_PX = 28
const MIN_POINTS_TO_CLOSE = 3
/** Matches the wizard's own displayed "typical" ceiling default. */
const DEFAULT_CEILING_M = 2.7

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const snapMm = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM


/** Polygon area (mm²) via the plain shoelace formula — same formula computeFloorArea uses. */
function polygonAreaMm2(points: Point[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, z1] = points[i]
    const [x2, z2] = points[(i + 1) % points.length]
    area += x1 * z2 - x2 * z1
  }
  return Math.abs(area) / 2
}

export default function DrawRoomPage() {
  const navigate = useNavigate()
  const loadRoom = useRoomStore((s) => s.loadRoom)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [closed, setClosed] = useState(false)
  const [hover, setHover] = useState<Point | null>(null)

  /** Client (screen) coords → this SVG's local (mm) coords, plus the
   *  current px-per-local-unit scale — same idiom as ChiroqPlanView's
   *  planPoint / svgPointFromClient. */
  function svgPointFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, z: 0, pxPerUnit: 1 }
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const m = svg.getScreenCTM()
    if (!m) return { x: 0, z: 0, pxPerUnit: 1 }
    const p = pt.matrixTransform(m.inverse())
    return { x: p.x, z: p.y, pxPerUnit: m.a || 1 }
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (closed) return
    const { x, z, pxPerUnit } = svgPointFromClient(e.clientX, e.clientY)

    // (a) Tapping near the first point closes the shape, once there is
    // enough of one to close.
    if (points.length >= MIN_POINTS_TO_CLOSE) {
      const [fx, fz] = points[0]
      const distMm = Math.hypot(x - fx, z - fz)
      const closeThresholdMm = CLOSE_PX / pxPerUnit
      if (distMm <= closeThresholdMm) {
        setClosed(true)
        setHover(null)
        return
      }
    }

    const snapped: Point = [clamp(snapMm(x), 0, CANVAS_MM), clamp(snapMm(z), 0, CANVAS_MM)]
    setPoints((prev) => [...prev, snapped])
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (closed) return
    const { x, z } = svgPointFromClient(e.clientX, e.clientY)
    setHover([clamp(snapMm(x), 0, CANVAS_MM), clamp(snapMm(z), 0, CANVAS_MM)])
  }

  function undo() {
    if (closed) return
    setPoints((prev) => prev.slice(0, -1))
  }

  function clearAll() {
    setPoints([])
    setClosed(false)
  }

  /** Explicit fallback for closing — the "Yopish" button. */
  function tryClose() {
    if (points.length >= MIN_POINTS_TO_CLOSE) setClosed(true)
  }

  function handleContinue() {
    if (points.length < MIN_POINTS_TO_CLOSE) return

    // Snap to the drawn shape's axis-aligned bounding box, exactly like
    // LidarPage's own import pipeline does (snapToFourWalls in
    // roomScanImport.ts) — NOT the raw drawn polygon. The 3D room shell
    // (RoomShell/WallComponents/buildWallDefs, etc.) only knows how to render
    // a plain 4-wall axis-aligned rectangle; real N-wall/polygon rendering is
    // a future phase that doesn't exist yet. Shipping the actual drawn
    // shape via `vertices` produced a room the 3D view couldn't render at
    // all (a blank canvas, reported as "error after entering size by hand")
    // — this is the same lesson LiDAR's importer already encodes, just not
    // followed here originally.
    const xs = points.map(([x]) => x)
    const zs = points.map(([, z]) => z)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minZ = Math.min(...zs), maxZ = Math.max(...zs)
    const widthMm = Math.round(maxX - minX)
    const depthMm = Math.round(maxZ - minZ)

    // loadRoom() takes the same payload shape the API returns (RoomPayload):
    // wall lengths in METRES — it multiplies by 1000 internally to build the
    // store's mm-based RoomGeometry. Points on this canvas are tracked in mm
    // (see the `Point` type above), so widthMm/depthMm must be converted here;
    // passing them straight through fed loadRoom values already 1000x too
    // large (a 3m wall became a 3000m wall), which produced a technically
    // valid but astronomically oversized room — one the 3D camera's far plane
    // never reaches, rendering as a blank canvas, and one the backend rejects
    // outright (Wall.length must be < 25m), so the room was never actually
    // saved either.
    const widthM = widthMm / 1000
    const depthM = depthMm / 1000

    // Same call shape LidarPage.tsx uses: load into the store, then hand
    // off to the wizard — no custom review/save UI here. `from=draw` tells
    // the wizard the wall lengths are already exact (drawn, not guessed),
    // so it only asks for ceiling height before saving and going straight
    // into the 3D studio, skipping the per-wall review steps.
    loadRoom({
      geometry: {
        walls: [
          { id: 'A', length: widthM, elements: [] },
          { id: 'B', length: depthM, elements: [] },
          { id: 'C', length: widthM, elements: [] },
          { id: 'D', length: depthM, elements: [] },
        ],
      },
      ceiling_h: DEFAULT_CEILING_M,
    })
    navigate('/wizard?from=draw')
  }

  const canClose = !closed && points.length >= MIN_POINTS_TO_CLOSE
  const areaM2 = closed ? polygonAreaMm2(points) / 1_000_000 : null

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at center, #1A2230 0%, #0B0E13 100%)' }}
    >
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-14 left-5 z-10 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}
        aria-label="Orqaga"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l12 12M14 2L2 14" />
        </svg>
      </button>

      {/* Header */}
      <div className="pt-14 pb-2 px-16 flex flex-col items-center gap-1 text-center shrink-0">
        <p className="text-white text-[18px] font-bold mt-12">Xonani chizish</p>
        <p className="text-white/60 text-[13px]">
          Xona burchaklarini ketma-ket bosib chiqing
          {areaM2 !== null && <span className="text-white/80 font-semibold"> · {areaM2.toFixed(2)} m²</span>}
        </p>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 mx-4 mb-3 rounded-2xl overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_MM} ${CANVAS_MM}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full touch-none"
          style={{ background: '#F0EDE5' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHover(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* metre grid */}
          {Array.from({ length: CANVAS_MM / GRID_MM }, (_, i) => (i + 1) * GRID_MM).map((v) => (
            <g key={`v${v}`}>
              <line x1={v} y1={0} x2={v} y2={CANVAS_MM} stroke="#DDD8CC" strokeWidth={8} />
              <text x={v + 40} y={130} fontSize={130} fill="#9CA3AF">{v / 1000}m</text>
            </g>
          ))}
          {Array.from({ length: CANVAS_MM / GRID_MM }, (_, i) => (i + 1) * GRID_MM).map((v) => (
            <g key={`h${v}`}>
              <line x1={0} y1={v} x2={CANVAS_MM} y2={v} stroke="#DDD8CC" strokeWidth={8} />
              <text x={40} y={v - 30} fontSize={130} fill="#9CA3AF">{v / 1000}m</text>
            </g>
          ))}

          {/* completed polygon fill, once closed */}
          {closed && (
            <polygon
              points={points.map(([x, z]) => `${x},${z}`).join(' ')}
              fill="#2563EB"
              opacity={0.12}
            />
          )}

          {/* placed segments — each consecutive pair, in drawing order */}
          {points.slice(1).map((p, idx) => (
            <Segment key={`seg${idx}`} a={points[idx]} b={p} />
          ))}
          {/* closing edge, drawn only once the shape is closed */}
          {closed && points.length >= 2 && (
            <Segment a={points[points.length - 1]} b={points[0]} />
          )}

          {/* live rubber-band from the last point to the pointer, while drawing */}
          {!closed && hover && points.length > 0 && (
            <line
              x1={points[points.length - 1][0]}
              y1={points[points.length - 1][1]}
              x2={hover[0]}
              y2={hover[1]}
              stroke="#2563EB"
              strokeWidth={16}
              strokeDasharray="60 40"
              opacity={0.5}
            />
          )}

          {/* placed corner points */}
          {points.map(([x, z], i) => (
            <circle key={`pt${i}`} cx={x} cy={z} r={i === 0 && canClose ? 130 : 90} fill="#1E40AF" stroke="white" strokeWidth={20} />
          ))}
          {/* ring around the first point once closing is possible — the close target */}
          {canClose && (
            <circle cx={points[0][0]} cy={points[0][1]} r={260} fill="none" stroke="#F97316" strokeWidth={24} strokeDasharray="50 40" />
          )}

          {/* ghost of the next point about to be placed */}
          {!closed && hover && (
            <circle cx={hover[0]} cy={hover[1]} r={70} fill="none" stroke="#2563EB" strokeWidth={16} opacity={0.6} />
          )}
        </svg>
      </div>

      {/* Controls */}
      <div
        className="shrink-0 px-5 pt-2 flex flex-col gap-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
      >
        <div className="flex items-center justify-center gap-3">
          {!closed && (
            <button
              onClick={undo}
              disabled={points.length === 0}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-white/80 disabled:opacity-30"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              Orqaga
            </button>
          )}
          <button
            onClick={clearAll}
            disabled={points.length === 0}
            className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-white/80 disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.12)' }}
          >
            Tozalash
          </button>
          {!closed && (
            <button
              onClick={tryClose}
              disabled={!canClose}
              className="px-6 py-2.5 rounded-full text-[13px] font-bold text-white disabled:opacity-30"
              style={{ background: '#F97316' }}
            >
              Yopish
            </button>
          )}
        </div>

        {closed && (
          <button
            onClick={handleContinue}
            className="w-full py-3.5 rounded-full text-[15px] font-bold text-white"
            style={{ background: '#1E40AF' }}
          >
            Davom etish →
          </button>
        )}
      </div>
    </div>
  )
}

/** One placed wall segment: the connecting line plus its live length label. */
function Segment({ a, b }: { a: Point; b: Point }) {
  const [ax, az] = a
  const [bx, bz] = b
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  const lengthM = Math.hypot(bx - ax, bz - az) / 1000
  const label = `${lengthM.toFixed(2)} m`
  const w = Math.max(360, label.length * 95 + 100)
  const h = 260

  return (
    <g>
      <line x1={ax} y1={az} x2={bx} y2={bz} stroke="#1E40AF" strokeWidth={26} strokeLinecap="round" />
      <rect x={mx - w / 2} y={mz - h / 2} width={w} height={h} rx={60} fill="#1A2340" />
      <text x={mx} y={mz} fontSize={160} fontWeight={700} fill="white" textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </g>
  )
}
