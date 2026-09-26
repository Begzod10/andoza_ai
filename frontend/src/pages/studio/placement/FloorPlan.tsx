import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { nanoid } from 'nanoid'
import type { ElectricalType, PlacedElectrical, PlacedLight, RoomGeometry } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'
import { isAbcdRoom, planPolygon, pointInPolygon, svgPoints, wallPositionAt } from '@/lib/planPolygon'
import { lightType, kelvinToHex } from '@/lib/lightCatalog'
import type { Room } from '@/lib/api'
import { CATALOG, KEYBOARD_NUDGE_MM, NAVY, PAD, SCALE } from './constants'
import {
  detectPolyWall, detectWall, polyDeviceSvgPos, polyEdge, polyFromPx, polyRouteSvgPts,
  polyToPx, routeSvgPts, svgPt, wallDeviceSvgPos,
} from './geometry'
import { MiniSymbol } from './icons'
import { WallOpenings, WallOpeningsMask } from './WallOpenings'
import { DimensionOverlay, PolyDimensionOverlay } from './DimensionOverlay'
import type { TabId, WallHover, WireConfig } from './types'

// ─── Floor plan SVG ────────────────────────────────────────────────────────────

interface FloorPlanProps {
  room: Room
  geometry: RoomGeometry
  electricals: PlacedElectrical[]
  lights: PlacedLight[]
  tab: TabId
  activeTool: ElectricalType | null
  wireConfigs: Record<string, WireConfig>
  onPlaceElectrical: (e: PlacedElectrical) => void
  onMoveElectrical: (id: string, positionMm: number) => void
  onRemoveElectrical: (id: string) => void
  onPlaceLight: (l: PlacedLight) => void
  onRemoveLight: (id: string) => void
}

export function FloorPlan({
  room, geometry, electricals, lights, tab, activeTool, wireConfigs,
  onPlaceElectrical, onMoveElectrical, onRemoveElectrical, onPlaceLight, onRemoveLight,
}: FloorPlanProps) {
  // X follows wall A, Z follows wall B — the orientation every view shares
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width })
  const svgW = W * SCALE + PAD * 2
  const svgH = D * SCALE + PAD * 2
  const rW = W * SCALE
  const rD = D * SCALE
  // Polygon (non A-B-C-D) room: its outline, or null for the legacy rectangle
  const poly = useMemo(() => (isAbcdRoom(geometry) ? null : planPolygon(geometry)), [geometry])

  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<WallHover | null>(null)
  const [hoverLight, setHoverLight] = useState<{ x: number; y: number } | null>(null)

  // ── 2D drag state for placed electricals ──────────────────────────────────
  const [draggingEl, setDraggingEl] = useState<{
    id: string; wallId: string; posMm: number
  } | null>(null)
  const dragStartClient = useRef({ x: 0, y: 0 })
  const dragHasMoved = useRef(false)
  const lastGestureWasDrag = useRef(false)

  useEffect(() => {
    function onPointerUp() {
      if (!draggingEl) return
      if (dragHasMoved.current) {
        onMoveElectrical(draggingEl.id, draggingEl.posMm)
        lastGestureWasDrag.current = true
      }
      setDraggingEl(null)
      dragHasMoved.current = false
    }
    window.addEventListener('pointerup', onPointerUp)
    return () => window.removeEventListener('pointerup', onPointerUp)
  }, [draggingEl, onMoveElectrical])

  /** Wall length in mm for either room shape (0 for a wall that doesn't exist). */
  const wallLenMm = useCallback((wallId: string): number => {
    if (poly) return polyEdge(poly, wallId)?.len ?? 0
    return wallId === 'A' || wallId === 'C' ? W * 1000 : D * 1000
  }, [poly, W, D])

  /** Device → SVG px (+ symbol rotation); null when its wall is not in this room. */
  const devicePos = useCallback((el: PlacedElectrical): { x: number; y: number; rotDeg?: number } | null => {
    if (poly) return polyDeviceSvgPos(poly, el)
    return wallDeviceSvgPos(el, W, D)
  }, [poly, W, D])

  /** Is a plan point (px) on the room's floor? */
  const onFloor = useCallback((x: number, y: number): boolean => {
    if (poly) {
      const p = polyFromPx(poly, x, y)
      return pointInPolygon(p.x, p.z, poly.vertices)
    }
    const rx = x - PAD, ry = y - PAD
    return rx >= 0 && rx <= rW && ry >= 0 && ry <= rD
  }, [poly, rW, rD])

  // Panel is a special one-time device — derive its SVG position from placed electricals
  const panelEl = electricals.find(e => e.type === 'panel')
  const panelPos = panelEl ? devicePos(
    draggingEl?.id === panelEl.id ? { ...panelEl, positionMm: draggingEl.posMm } : panelEl
  ) : null

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const { x, y } = svgPt(svgRef.current, e)

    // ── Handle dragging a placed electrical ──
    if (draggingEl) {
      const lenMm = wallLenMm(draggingEl.wallId)
      let newPosMm: number
      if (poly) {
        const edge = polyEdge(poly, draggingEl.wallId)
        if (!edge) return
        const p = polyFromPx(poly, x, y)
        newPosMm = Math.round(wallPositionAt(edge, p.x, p.z))
      } else {
        const isH = draggingEl.wallId === 'A' || draggingEl.wallId === 'C'
        newPosMm = isH
          ? Math.round((x - PAD) / SCALE * 1000)
          : Math.round((y - PAD) / SCALE * 1000)
      }
      newPosMm = Math.max(80, Math.min(lenMm - 80, newPosMm))
      const dx = e.clientX - dragStartClient.current.x
      const dy = e.clientY - dragStartClient.current.y
      if (Math.abs(dx) + Math.abs(dy) > 4) dragHasMoved.current = true
      setDraggingEl(prev => prev ? { ...prev, posMm: newPosMm } : null)
      return
    }

    if (tab === 'elektr' && activeTool) {
      const hit = poly ? detectPolyWall(poly, x, y) : detectWall(x, y, W, D)
      setHover(hit)
      setHoverLight(null)
    } else if (tab === 'chiroq') {
      setHover(null)
      setHoverLight(onFloor(x, y) ? { x, y } : null)
    } else {
      setHover(null)
      setHoverLight(null)
    }
  }, [tab, activeTool, W, D, poly, draggingEl, wallLenMm, onFloor])

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (lastGestureWasDrag.current) { lastGestureWasDrag.current = false; return }
    if (!svgRef.current) return
    const { x, y } = svgPt(svgRef.current, e)
    if (tab === 'elektr' && activeTool) {
      const hit = poly ? detectPolyWall(poly, x, y) : detectWall(x, y, W, D)
      if (hit) {
        const cat = CATALOG.find(c => c.type === activeTool)!
        onPlaceElectrical({ id: nanoid(), type: activeTool, wallId: hit.wallId, positionMm: hit.positionMm, heightMm: cat.height })
      }
    } else if (tab === 'chiroq') {
      if (onFloor(x, y)) {
        const p = poly ? polyFromPx(poly, x, y) : { x: ((x - PAD) / SCALE) * 1000, z: ((y - PAD) / SCALE) * 1000 }
        onPlaceLight({ id: nanoid(), xMm: Math.round(p.x), zMm: Math.round(p.z) })
      }
    }
  }, [tab, activeTool, W, D, poly, onFloor, onPlaceElectrical, onPlaceLight])

  const cursor = draggingEl
    ? 'grabbing'
    : tab === 'elektr'
      ? (activeTool ? 'crosshair' : 'default')
      : 'crosshair'

  const lightR = 32  // glow radius px

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full drop-shadow-md select-none"
      style={{ cursor, maxHeight: 'calc(100dvh - 180px)' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setHover(null); setHoverLight(null) }}
      onClick={handleClick}
    >
      {/* Scoped focus ring for the keyboard-focusable plan items below —
          the app's global :focus-visible rule (styles/global.css) targets
          `outline`, which browsers do render on SVG shapes, but that isn't
          guaranteed for every element/shape combination here, so it's
          restated explicitly and locally rather than relying on it silently. */}
      <style>{`.kbd-focusable:focus-visible { outline: 2px solid var(--color-primary, #1B3784); outline-offset: 2px; }`}</style>
      <defs>
        <radialGradient id="lightGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E0F0FF" stopOpacity="0.95"/>
          <stop offset="45%" stopColor="#C8E4FF" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#C8E4FF" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="lightGlowHover" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E0F0FF" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#C8E4FF" stopOpacity="0"/>
        </radialGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {/* Wire mask: white everywhere except door/window openings (black) */}
        <mask id="wireMask">
          <rect x="0" y="0" width={svgW} height={svgH} fill="white"/>
          <WallOpeningsMask W={W} D={D} rW={rW} rD={rD} poly={poly}/>
        </mask>
        {poly && (
          <clipPath id="elektrFloorClip">
            <polygon points={svgPoints(poly.vertices.map(([x, z]) => polyToPx(poly, x, z)))}/>
          </clipPath>
        )}
      </defs>

      {/* Paper background */}
      <rect x="0" y="0" width={svgW} height={svgH} fill="#F9F7F4"/>

      {/* Room floor */}
      {poly ? (
        <polygon points={svgPoints(poly.vertices.map(([x, z]) => polyToPx(poly, x, z)))} fill="#F0EBE0" stroke="none"/>
      ) : (
        <rect x={PAD} y={PAD} width={rW} height={rD} fill="#F0EBE0" stroke="none"/>
      )}

      {/* Grid (subtle) — clipped to the floor of a polygon room */}
      <g clipPath={poly ? 'url(#elektrFloorClip)' : undefined}>
        {Array.from({ length: Math.ceil(W) + 1 }).map((_, i) => (
          <line key={`gx${i}`}
            x1={PAD + i * SCALE} y1={PAD}
            x2={PAD + i * SCALE} y2={PAD + rD}
            stroke="#D8D0C0" strokeWidth="0.5" strokeDasharray="3 4"/>
        ))}
        {Array.from({ length: Math.ceil(D) + 1 }).map((_, i) => (
          <line key={`gz${i}`}
            x1={PAD} y1={PAD + i * SCALE}
            x2={PAD + rW} y2={PAD + i * SCALE}
            stroke="#D8D0C0" strokeWidth="0.5" strokeDasharray="3 4"/>
        ))}
      </g>

      {poly ? (
        <>
          {/* Wall lines along the outline */}
          <polygon points={svgPoints(poly.vertices.map(([x, z]) => polyToPx(poly, x, z)))}
            fill="none" stroke="#3A3020" strokeWidth="8" strokeLinejoin="miter"/>

          {/* Doors and windows from room geometry */}
          <WallOpenings W={W} D={D} poly={poly} />

          {/* Wall id + length, just outside each wall's midpoint */}
          {poly.edges.map(e => {
            const [mx, my] = polyToPx(poly, (e.x1 + e.x2) / 2, (e.z1 + e.z2) / 2)
            return (
              <text key={e.id} x={mx - e.nx * 22} y={my - e.nz * 22} fill="#888" fontFamily="sans-serif"
                textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="bold">
                {e.id} · {(e.len / 1000).toFixed(1)} m
              </text>
            )
          })}
        </>
      ) : (
        <>
          {/* Dimension labels */}
          <text x={PAD + rW / 2} y={PAD - 10} textAnchor="middle" fontSize="11" fill="#888" fontFamily="sans-serif">
            {W.toFixed(1)} m
          </text>
          <text x={PAD - 10} y={PAD + rD / 2} textAnchor="middle" fontSize="11" fill="#888"
            fontFamily="sans-serif" transform={`rotate(-90, ${PAD - 10}, ${PAD + rD / 2})`}>
            {D.toFixed(1)} m
          </text>

          {/* Wall lines */}
          <rect x={PAD} y={PAD} width={rW} height={rD}
            fill="none" stroke="#3A3020" strokeWidth="8" strokeLinejoin="miter"/>

          {/* Doors and windows from room geometry */}
          <WallOpenings W={W} D={D} poly={null} />

          {/* Wall labels */}
          {[
            { label: 'A', x: PAD + rW / 2, y: PAD - 22 },
            { label: 'C', x: PAD + rW / 2, y: PAD + rD + 22 },
            { label: 'D', x: PAD - 22, y: PAD + rD / 2 },
            { label: 'B', x: PAD + rW + 22, y: PAD + rD / 2 },
          ].map(l => (
            <text key={l.label} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fill="#888" fontFamily="sans-serif" fontWeight="bold">{l.label}</text>
          ))}
        </>
      )}

      {/* ── LIGHTS (Chiroq tab) ─────────────────────────────────────────────── */}
      {tab === 'chiroq' && lights.map(light => {
        const [lx, ly] = poly
          ? polyToPx(poly, light.xMm, light.zMm)
          : [PAD + light.xMm / 1000 * SCALE, PAD + light.zMm / 1000 * SCALE]
        // Type, colour temperature and size come from the fixture itself, the
        // way the Chiroqlar plan draws it. A generic dot here made a warm
        // pendant and a cool downlight look like the same thing.
        const t = lightType(light.type)
        const hex = kelvinToHex(light.colorK ?? t.colorK)
        const dim = light.off
        const r = Math.max(7, (Math.max(t.sizeM.w, t.sizeM.d) * SCALE) / 2)
        const isLinear = t.id === 'led_linear' || t.id === 'track' || t.id === 'led_track' || t.id === 'bath'
        function activateLight(e: { stopPropagation: () => void }) {
          e.stopPropagation()
          onRemoveLight(light.id)
        }
        return (
          <g key={light.id} style={{ cursor: 'pointer' }}
            tabIndex={0}
            role="button"
            aria-label={`${t.name} chirog'i — o'chirish uchun Enter yoki Delete bosing`}
            className="kbd-focusable"
            onClick={activateLight}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                activateLight(e)
              }
            }}>
            {/* spill — roughly how far this fixture throws */}
            <circle cx={lx} cy={ly} r={r * 3.2} fill={hex} opacity={dim ? 0.04 : 0.13}/>
            <circle cx={lx} cy={ly} r={r} fill={dim ? '#D1D5DB' : hex}
              stroke="#3A3020" strokeWidth="1.2"/>
            {/* linear fixtures read as a bar, not a dot */}
            {isLinear && (
              <rect
                x={lx - (t.sizeM.w * SCALE) / 2} y={ly - 3}
                width={t.sizeM.w * SCALE} height={6}
                fill={dim ? '#D1D5DB' : hex} stroke="#3A3020" strokeWidth="1"
                transform={`rotate(${((light.rotation ?? 0) * 180) / Math.PI} ${lx} ${ly})`}
              />
            )}
            <text x={lx} y={ly + 3} fontSize="9" textAnchor="middle"
              style={{ pointerEvents: 'none' }}>{t.emoji}</text>
          </g>
        )
      })}
      {tab === 'chiroq' && hoverLight && (
        <g style={{ pointerEvents: 'none' }}>
          <circle cx={hoverLight.x} cy={hoverLight.y} r={lightR} fill="url(#lightGlowHover)"/>
          <circle cx={hoverLight.x} cy={hoverLight.y} r="7" fill="#E8F2FF"
            stroke="#7BB8F0" strokeWidth="1.5" opacity="0.6"/>
        </g>
      )}

      {/* ── ELECTRICALS (Elektr tab) ────────────────────────────────────────── */}
      {tab === 'elektr' && (
        <>
          {/* Wires routed along wall surfaces to panel */}
          {panelPos && panelEl && electricals.filter(e => e.type !== 'panel').map(el => {
            const cfg = wireConfigs[el.id]
            if (!cfg) return null
            const displayEl = draggingEl?.id === el.id ? { ...el, positionMm: draggingEl.posMm } : el
            const pts = poly ? polyRouteSvgPts(poly, displayEl, panelEl, cfg.cw) : routeSvgPts(displayEl, panelEl, W, D, cfg.cw)
            if (!pts) return null
            const pointsStr = pts.map(([x, y]) => `${x},${y}`).join(' ')
            return (
              <polyline key={`w-${el.id}`}
                points={pointsStr}
                fill="none"
                stroke={cfg.color}
                strokeWidth="1.8"
                strokeDasharray="6 3"
                opacity="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                mask="url(#wireMask)"/>
            )
          })}

          {/* Placed devices — draggable along their wall */}
          {electricals.map(el => {
            const isDragged = draggingEl?.id === el.id
            const displayEl = isDragged ? { ...el, positionMm: draggingEl!.posMm } : el
            const dp = devicePos(displayEl)
            if (!dp) return null // its wall is not part of this room's outline

            function startElDrag(e: React.PointerEvent) {
              e.stopPropagation()
              dragStartClient.current = { x: e.clientX, y: e.clientY }
              dragHasMoved.current = false
              setDraggingEl({ id: el.id, wallId: el.wallId, posMm: el.positionMm })
            }

            // Keyboard equivalent of the pointer drag (move) and the sidebar's
            // "✕" button (delete). There is no separate on-canvas click-select
            // for these items today — pointer users only drag or delete via
            // the sidebar list — so focus itself is the keyboard "selection",
            // and Enter/Space is a no-op that matches the item's own (also
            // no-op) click behavior while still preventing Space from scrolling.
            function handleElKeyDown(e: React.KeyboardEvent) {
              const lenMm = wallLenMm(el.wallId)
              switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                  e.preventDefault()
                  onMoveElectrical(el.id, Math.max(80, Math.min(lenMm - 80, el.positionMm - KEYBOARD_NUDGE_MM)))
                  break
                case 'ArrowRight':
                case 'ArrowDown':
                  e.preventDefault()
                  onMoveElectrical(el.id, Math.max(80, Math.min(lenMm - 80, el.positionMm + KEYBOARD_NUDGE_MM)))
                  break
                case 'Delete':
                case 'Backspace':
                  e.preventDefault()
                  onRemoveElectrical(el.id)
                  break
                case 'Enter':
                case ' ':
                  e.preventDefault()
                  break
              }
            }

            const elLabel = CATALOG.find(c => c.type === el.type)?.label ?? el.type
            const elAriaLabel = `${elLabel} — ${el.wallId} devor. Ko'chirish: strelka tugmalari, o'chirish: Delete`

            if (el.type === 'panel') {
              return (
                <g key={el.id}
                  transform={`translate(${dp.x}, ${dp.y})`}
                  style={{ cursor: isDragged ? 'grabbing' : 'grab' }}
                  tabIndex={0}
                  role="button"
                  aria-label={elAriaLabel}
                  className="kbd-focusable"
                  onPointerDown={startElDrag}
                  onKeyDown={handleElKeyDown}>
                  <rect x="-11" y="-15" width="22" height="28" rx="2.5"
                    fill={NAVY} stroke="#0D2560" strokeWidth="1.2"
                    opacity={isDragged ? 0.75 : 1}/>
                  <rect x="-8" y="-12" width="16" height="20" rx="1.5"
                    fill="white" fillOpacity="0.12"/>
                  {[-1, 1].map(col => [-8, -2, 4].map(rowY => (
                    <rect key={`${col}-${rowY}`}
                      x={col * 5 - 3} y={rowY} width="5" height="4" rx="1"
                      fill="white" fillOpacity={col === -1 ? 0.9 : 0.5}/>
                  )))}
                  <line x1="-8" y1="12" x2="8" y2="12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                  <text y="19" textAnchor="middle" fontSize="5" fill="white"
                    fontFamily="sans-serif" fontWeight="bold">ЩИТ</text>
                  {/* Drag handle hint */}
                  {isDragged && <circle r="14" fill="none" stroke="white" strokeWidth="1" strokeDasharray="3 2" opacity="0.6"/>}
                </g>
              )
            }
            return (
              <g key={el.id}
                transform={`translate(${dp.x}, ${dp.y})`}
                style={{ cursor: isDragged ? 'grabbing' : 'grab' }}
                tabIndex={0}
                role="button"
                aria-label={elAriaLabel}
                className="kbd-focusable"
                onPointerDown={startElDrag}
                onKeyDown={handleElKeyDown}>
                <circle r="12" fill="white" opacity={isDragged ? 0.5 : 0.8}/>
                <MiniSymbol type={el.type} wallId={el.wallId} rotDeg={dp.rotDeg}/>
                {isDragged && <circle r="14" fill="none" stroke={NAVY} strokeWidth="1" strokeDasharray="3 2" opacity="0.5"/>}
                <circle r="12" fill="transparent"/>
              </g>
            )
          })}

          {/* Ghost preview on hover */}
          {hover && activeTool && (
            <g transform={`translate(${hover.sx}, ${hover.sy})`} opacity="0.45" style={{ pointerEvents: 'none' }}>
              <circle r="10" fill="white" opacity="0.8"/>
              <MiniSymbol type={activeTool} wallId={hover.wallId} rotDeg={hover.rotDeg}/>
            </g>
          )}

          {/* Hover wall highlight */}
          {hover && activeTool && (() => {
            const hw = 6
            const hl = 40
            if (hover.angleDeg !== undefined) return (
              <rect x={hover.sx - hl / 2} y={hover.sy - hw / 2}
                width={hl} height={hw} rx="2" fill={NAVY} opacity="0.2" style={{ pointerEvents: 'none' }}
                transform={`rotate(${hover.angleDeg}, ${hover.sx}, ${hover.sy})`}/>
            )
            switch (hover.wallId) {
              case 'A': case 'C': return (
                <rect x={hover.sx - hl / 2} y={hover.sy - hw / 2}
                  width={hl} height={hw} rx="2" fill={NAVY} opacity="0.2" style={{ pointerEvents: 'none' }}/>
              )
              case 'D': case 'B': return (
                <rect x={hover.sx - hw / 2} y={hover.sy - hl / 2}
                  width={hw} height={hl} rx="2" fill={NAVY} opacity="0.2" style={{ pointerEvents: 'none' }}/>
              )
            }
          })()}
        </>
      )}

      {/* ── DIMENSION OVERLAY (O'lchamlar tab) ─────────────────────────────── */}
      {tab === 'olchamlar' && (
        poly
          ? <PolyDimensionOverlay electricals={electricals} poly={poly}/>
          : <DimensionOverlay electricals={electricals} W={W} D={D}/>
      )}
    </svg>
  )
}
