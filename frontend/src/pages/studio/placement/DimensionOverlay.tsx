import type { PlacedElectrical } from '@/store/roomStore'
import type { PlanPolygon } from '@/lib/planPolygon'
import { DIM_C, DIM_TICK, PAD, SCALE, WALL_STROKE } from './constants'
import { fmtM, polyDeviceSvgPos, polyEdge, wallDeviceSvgPos } from './geometry'
import type { WallId } from './types'

// ─── Dimension overlay ────────────────────────────────────────────────────────

function HDim({ xa, xb, y, extY, label }: { xa: number; xb: number; y: number; extY: number; label: string }) {
  if (Math.abs(xb - xa) < 6) return null
  const mx = (xa + xb) / 2
  return (
    <g stroke={DIM_C} fill="none" strokeWidth="0.7" style={{ pointerEvents: 'none' }}>
      <line x1={xa} y1={extY} x2={xa} y2={y}/>
      <line x1={xb} y1={extY} x2={xb} y2={y}/>
      <line x1={xa} y1={y} x2={xb} y2={y}/>
      {/* 45° ticks */}
      <line x1={xa - DIM_TICK} y1={y + DIM_TICK} x2={xa + DIM_TICK} y2={y - DIM_TICK}/>
      <line x1={xb - DIM_TICK} y1={y + DIM_TICK} x2={xb + DIM_TICK} y2={y - DIM_TICK}/>
      <rect x={mx - label.length * 2.5} y={y - 11} width={label.length * 5} height={9}
        fill="#F9F7F4" stroke="none"/>
      <text x={mx} y={y - 4} textAnchor="middle" fontSize="7.5"
        fontFamily="system-ui,sans-serif" fill={DIM_C} stroke="none" fontWeight="600">{label}</text>
    </g>
  )
}

function VDim({ ya, yb, x, extX, label }: { ya: number; yb: number; x: number; extX: number; label: string }) {
  if (Math.abs(yb - ya) < 6) return null
  const my = (ya + yb) / 2
  const leftSide = x < extX
  return (
    <g stroke={DIM_C} fill="none" strokeWidth="0.7" style={{ pointerEvents: 'none' }}>
      <line x1={extX} y1={ya} x2={x} y2={ya}/>
      <line x1={extX} y1={yb} x2={x} y2={yb}/>
      <line x1={x} y1={ya} x2={x} y2={yb}/>
      <line x1={x - DIM_TICK} y1={ya - DIM_TICK} x2={x + DIM_TICK} y2={ya + DIM_TICK}/>
      <line x1={x - DIM_TICK} y1={yb - DIM_TICK} x2={x + DIM_TICK} y2={yb + DIM_TICK}/>
      <rect x={leftSide ? x - label.length * 5 - 2 : x + 2} y={my - 5}
        width={label.length * 5} height={9} fill="#F9F7F4" stroke="none"/>
      <text x={leftSide ? x - 3 : x + 3} y={my}
        dominantBaseline="middle" textAnchor={leftSide ? 'end' : 'start'} fontSize="7.5"
        fontFamily="system-ui,sans-serif" fill={DIM_C} stroke="none" fontWeight="600">{label}</text>
    </g>
  )
}

export function DimensionOverlay({ electricals, W, D }: { electricals: PlacedElectrical[]; W: number; D: number }) {
  const rW = W * SCALE, rD = D * SCALE
  const hs = WALL_STROKE / 2
  const byWall: Record<WallId, PlacedElectrical[]> = { A: [], B: [], C: [], D: [] }
  for (const el of electricals) byWall[el.wallId as WallId].push(el)

  const dims: React.ReactElement[] = []
  let k = 0

  // Horizontal chain: wall A (above) or C (below)
  for (const wallId of ['A', 'C'] as const) {
    const devs = [...byWall[wallId]].sort((a, b) => a.positionMm - b.positionMm)
    const lenMm = W * 1000
    const mms = [0, ...devs.map(d => d.positionMm), lenMm]
    const xs  = mms.map(mm => PAD + (mm / 1000) * SCALE)
    const dimY  = wallId === 'A' ? PAD - hs - 20 : PAD + rD + hs + 20
    const extY  = wallId === 'A' ? PAD - hs - 2  : PAD + rD + hs + 2
    for (let i = 0; i < xs.length - 1; i++)
      dims.push(<HDim key={k++} xa={xs[i]} xb={xs[i+1]} y={dimY} extY={extY} label={fmtM(mms[i+1]-mms[i])}/>)
  }

  // Vertical chain: wall D (left) or B (right)
  for (const wallId of ['D', 'B'] as const) {
    const devs = [...byWall[wallId]].sort((a, b) => a.positionMm - b.positionMm)
    const lenMm = D * 1000
    const mms = [0, ...devs.map(d => d.positionMm), lenMm]
    const ys  = mms.map(mm => PAD + (mm / 1000) * SCALE)
    const dimX  = wallId === 'D' ? PAD - hs - 28 : PAD + rW + hs + 28
    const extX  = wallId === 'D' ? PAD - hs - 2  : PAD + rW + hs + 2
    for (let i = 0; i < ys.length - 1; i++)
      dims.push(<VDim key={k++} ya={ys[i]} yb={ys[i+1]} x={dimX} extX={extX} label={fmtM(mms[i+1]-mms[i])}/>)
  }

  // Height callouts inside room near each device
  const labels = electricals.map((el, i) => {
    const dp = wallDeviceSvgPos(el, W, D)
    const hLabel = `↕${fmtM(el.heightMm)}`
    const INS = 20
    let lx = dp.x, ly = dp.y
    switch (el.wallId as WallId) {
      case 'A': ly += INS; break
      case 'C': ly -= INS; break
      case 'D': lx += INS; break
      case 'B': lx -= INS; break
    }
    return (
      <text key={`hl-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
        fontSize="7" fontFamily="system-ui,sans-serif" fill={DIM_C} fontWeight="700"
        style={{ pointerEvents: 'none' }}>
        {hLabel}
      </text>
    )
  })

  return <>{dims}{labels}</>
}

/**
 * O'lchamlar for a polygon room: the per-device height callouts only. The
 * wall-edge dimension chains are laid out per rectangle side (above / below /
 * left / right) and have no faithful equivalent along an arbitrary outline,
 * so the plan says so instead of drawing a wrong chain.
 */
export function PolyDimensionOverlay({ electricals, poly }: { electricals: PlacedElectrical[]; poly: PlanPolygon }) {
  const INS = 20
  return (
    <g style={{ pointerEvents: 'none' }}>
      {electricals.map((el, i) => {
        const edge = polyEdge(poly, el.wallId)
        const dp = polyDeviceSvgPos(poly, el)
        if (!edge || !dp) return null
        return (
          <text key={`hl-${i}`} x={dp.x + edge.nx * INS} y={dp.y + edge.nz * INS}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="7" fontFamily="system-ui,sans-serif" fill={DIM_C} fontWeight="700">
            {`↕${fmtM(el.heightMm)}`}
          </text>
        )
      })}
      <text x={PAD} y={PAD - 30} fontSize="8" fontFamily="system-ui,sans-serif" fill="#888">
        Devor bo'ylab o'lcham zanjiri faqat A-B-C-D xonalar uchun — pozitsiyalar jadvalda
      </text>
    </g>
  )
}
