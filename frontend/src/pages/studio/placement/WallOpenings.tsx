import { useRoomStore } from '@/store/roomStore'
import { resolveElementPositions } from '@/lib/wallPositions'
import { resolveWindowStyle, mullionCount } from '@/lib/windowStyles'
import type { PlanPolygon } from '@/lib/planPolygon'
import { PAD, SCALE, WALL_STROKE, WIRE_INSET } from './constants'
import { polyFrames } from './geometry'
import type { WallFrame } from './types'

// ─── Wall openings (doors / windows) ─────────────────────────────────────────

interface OpeningProps {
  W: number   // room width in metres
  D: number   // room depth in metres
}

/** Straight run of a polyline in wall-local coordinates. */
function svgPath(frame: WallFrame, pts: Array<[number, number]>): string {
  return pts
    .map(([u, v], i) => {
      const [x, y] = frame.toSvg(u, v)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * The door's swept quarter-circle, as a polyline.
 *
 * A polyline rather than an SVG arc: the sweep flag of an `A` command depends
 * on the handedness of the frame it lands in, and walls B and D mirror it.
 * Sampling the arc sidesteps the flag entirely, and at this scale — dashed,
 * a few dozen px across — the segments are indistinguishable from a curve.
 */
function doorArcPts(hingeU: number, dirU: 1 | -1, radius: number, segments = 14): Array<[number, number]> {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const th = (Math.PI / 2) * (i / segments)
    return [hingeU + dirU * radius * Math.cos(th), radius * Math.sin(th)] as [number, number]
  })
}

export function WallOpenings({ W, D, poly }: OpeningProps & { poly: PlanPolygon | null }) {
  const geometry = useRoomStore((s) => s.geometry)
  const rW = W * SCALE
  const rD = D * SCALE
  const hs = WALL_STROKE / 2   // half stroke — extends this far each side from wall centre

  const frames: WallFrame[] = poly ? polyFrames(poly) : [
    // top, room below (+y)
    { id: 'A', wallLenMm: W * 1000, toSvg: (u, v) => [PAD + u, PAD + v] },
    // bottom, room above (-y)
    { id: 'C', wallLenMm: W * 1000, toSvg: (u, v) => [PAD + u, PAD + rD - v] },
    // left, room right (+x)
    { id: 'D', wallLenMm: D * 1000, toSvg: (u, v) => [PAD + v, PAD + u] },
    // right, room left (-x)
    { id: 'B', wallLenMm: D * 1000, toSvg: (u, v) => [PAD + rW - v, PAD + u] },
  ]

  const els: React.ReactElement[] = []

  for (const frame of frames) {
    const wall = geometry.walls.find(w => w.id === frame.id)
    if (!wall) continue

    const resolved = resolveElementPositions(wall.elements, frame.wallLenMm)
    const s = SCALE / 1000   // px per mm

    for (const el of resolved) {
      const u1 = el.position * s      // start px along wall
      const ew = el.width * s         // element width in px
      const u2 = u1 + ew
      const key = `${frame.id}-${el.id}`

      // White gap punched through the wall stroke — every opening has one
      const gap = (
        <path
          d={`${svgPath(frame, [[u1, -hs], [u2, -hs], [u2, hs], [u1, hs]])} Z`}
          fill="#F9F7F4" stroke="none"
        />
      )

      if (el.type === 'eshik') {
        // Hinge jamb and swing come from the element itself, so the plan shows
        // the door the 3D view shows — not a fixed left-hung 90° stand-in.
        const hingeLeft = (el.hinge ?? 'left') === 'left'
        const hingeU = hingeLeft ? u1 : u2
        const dirU: 1 | -1 = hingeLeft ? 1 : -1
        const openRad = ((el.openAngle ?? 0) * Math.PI) / 180
        const leafTip: [number, number] = [
          hingeU + dirU * ew * Math.cos(openRad),
          ew * Math.sin(openRad),
        ]

        els.push(
          <g key={key}>
            {gap}
            {/* Hinge jamb — a stub across the wall marking the pivot */}
            <path d={svgPath(frame, [[hingeU, -hs], [hingeU, hs * 3]])}
              stroke="#3A3020" strokeWidth="1.5" fill="none"/>
            {/* The leaf, at its actual open angle */}
            <path d={svgPath(frame, [[hingeU, 0], leafTip])}
              stroke="#3A3020" strokeWidth="1.2" fill="none"/>
            {/* The swept quarter — the clearance the door needs */}
            <path d={svgPath(frame, doorArcPts(hingeU, dirU, ew))}
              fill="none" stroke="#3A3020" strokeWidth="1" strokeDasharray="3 2"/>
          </g>
        )
      } else if (el.type === 'balkon') {
        // A balcony door reads as one glazed leaf plus its frame post — the
        // same symbol the Mebelirovka plan uses.
        els.push(
          <g key={key}>
            {gap}
            <path d={svgPath(frame, [[u1, -hs], [u1, hs]])} stroke="#3A3020" strokeWidth="1.5" fill="none"/>
            <path d={svgPath(frame, [[u2, -hs], [u2, hs]])} stroke="#3A3020" strokeWidth="1.5" fill="none"/>
            <path d={svgPath(frame, [[u1, 0], [u2, 0]])} stroke="#5090C0" strokeWidth="1.2" opacity="0.8" fill="none"/>
            <path d={svgPath(frame, [[u1 + ew * 0.55, -hs], [u1 + ew * 0.55, hs]])}
              stroke="#5090C0" strokeWidth="1.2" opacity="0.8" fill="none"/>
          </g>
        )
      } else {
        // Window: two glazing lines plus the mullions of its chosen style, so a
        // triple-casement no longer draws the same as a single fixed pane.
        const mullions = mullionCount(resolveWindowStyle(el))
        els.push(
          <g key={key}>
            {gap}
            <path d={svgPath(frame, [[u1, -hs], [u1, hs]])} stroke="#3A3020" strokeWidth="1.5" fill="none"/>
            <path d={svgPath(frame, [[u2, -hs], [u2, hs]])} stroke="#3A3020" strokeWidth="1.5" fill="none"/>
            <path d={svgPath(frame, [[u1, -2.5], [u2, -2.5]])} stroke="#5090C0" strokeWidth="1.2" opacity="0.8" fill="none"/>
            <path d={svgPath(frame, [[u1, 2.5], [u2, 2.5]])} stroke="#5090C0" strokeWidth="1.2" opacity="0.8" fill="none"/>
            {Array.from({ length: mullions }, (_, k) => {
              const mu = u1 + (ew / (mullions + 1)) * (k + 1)
              return (
                <path key={k} d={svgPath(frame, [[mu, -hs], [mu, hs]])}
                  stroke="#5090C0" strokeWidth="1.2" opacity="0.8" fill="none"/>
              )
            })}
          </g>
        )
      }
    }
  }

  return <>{els}</>
}

// Black mask rects at every door/window opening — clips wires there so they appear to route around them
export function WallOpeningsMask({ W, D, rW, rD, poly }: { W: number; D: number; rW: number; rD: number; poly: PlanPolygon | null }) {
  const geometry = useRoomStore(s => s.geometry)
  const hs = WALL_STROKE / 2   // 4px
  const WI = WIRE_INSET        // 5px
  const ext = 2
  const sc = SCALE / 1000

  const rects: React.ReactElement[] = []

  if (poly) {
    // Same band as the rectangle's rects (wall centre − hs − ext … wire inset + ext),
    // drawn in each wall's own frame so it follows a slanted wall.
    for (const frame of polyFrames(poly)) {
      const wall = geometry.walls.find(w => w.id === frame.id)
      if (!wall) continue
      resolveElementPositions(wall.elements, frame.wallLenMm).forEach((el, i) => {
        const u1 = el.position * sc - 1
        const u2 = u1 + el.width * sc + 2
        rects.push(
          <path key={`${frame.id}-${i}`} fill="black"
            d={`${svgPath(frame, [[u1, -hs - ext], [u2, -hs - ext], [u2, WI + ext], [u1, WI + ext]])} Z`}/>
        )
      })
    }
    return <>{rects}</>
  }

  const wallA = geometry.walls.find(w => w.id === 'A')
  if (wallA) resolveElementPositions(wallA.elements, W * 1000).forEach((el, i) => {
    rects.push(<rect key={`A-${i}`} x={PAD + el.position * sc - 1} y={PAD - hs - ext} width={el.width * sc + 2} height={hs + WI + ext * 2} fill="black"/>)
  })

  const wallC = geometry.walls.find(w => w.id === 'C')
  if (wallC) resolveElementPositions(wallC.elements, W * 1000).forEach((el, i) => {
    rects.push(<rect key={`C-${i}`} x={PAD + el.position * sc - 1} y={PAD + rD - WI - ext} width={el.width * sc + 2} height={WI + hs + ext * 2} fill="black"/>)
  })

  const wallD = geometry.walls.find(w => w.id === 'D')
  if (wallD) resolveElementPositions(wallD.elements, D * 1000).forEach((el, i) => {
    rects.push(<rect key={`D-${i}`} x={PAD - hs - ext} y={PAD + el.position * sc - 1} width={hs + WI + ext * 2} height={el.width * sc + 2} fill="black"/>)
  })

  const wallB = geometry.walls.find(w => w.id === 'B')
  if (wallB) resolveElementPositions(wallB.elements, D * 1000).forEach((el, i) => {
    rects.push(<rect key={`B-${i}`} x={PAD + rW - WI - ext} y={PAD + el.position * sc - 1} width={WI + hs + ext * 2} height={el.width * sc + 2} fill="black"/>)
  })

  return <>{rects}</>
}
