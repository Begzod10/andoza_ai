import { useState, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { StudioTabStrip } from '@/components/studio/StudioTabStrip'
import { PlanViewToggle } from '@/components/studio/PlanViewToggle'
import { useRoomStore } from '@/store/roomStore'
import type { ElectricalType, PlacedElectrical } from '@/store/roomStore'
import { roomExtents } from '@/lib/roomDims'
import { isAbcdRoom, planPolygon } from '@/lib/planPolygon'
import { CATALOG, ELEC_DIMS_3D, WIRE, WIRE_PALETTE } from './placement/constants'
import { polyPerimCoord, shortestCW, wirePerimCoord } from './placement/geometry'
import { FloorPlan } from './placement/FloorPlan'
import { ElektrSidebar } from './placement/ElektrSidebar'
import { ChiroqSidebar } from './placement/ChiroqSidebar'
import { OlchamlarSidebar } from './placement/OlchamlarSidebar'
import { ElektrThreeDView } from './placement/ElektrScene'
import type { StudioContext, TabId, WallId, WireConfig } from './placement/types'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlacementPage() {
  const { room } = useOutletContext<StudioContext>()
  const { electricals, lights, geometry, designState, addElectrical, moveElectrical, removeElectrical, addLight, removeLight, clearLights } = useRoomStore()

  const [tab, setTab] = useState<TabId>('elektr')
  // Elektr shows ONE viewport at a time, like Mebelirovka and Chiroqlar:
  // '3d' (default on entry) is the live scene, '2d' the full-width floor
  // plan. The hidden side stays mounted so toggling back keeps its state.
  const [planView, setPlanView] = useState<'2d' | '3d'>('3d')
  const [activeTool, setActiveTool] = useState<ElectricalType | null>(null)
  const [wireColors, setWireColors] = useState<Record<string, string>>({})
  const [wireRoutes, setWireRoutes] = useState<Record<string, boolean>>({})

  const panel = electricals.find(e => e.type === 'panel')
  // Fall back to geometry wall lengths (in mm→m) when room metadata is 0/missing
  // X follows wall A, Z follows wall B — the orientation every view shares
  const { W, D } = roomExtents(geometry, { W: room.length, D: room.width })
  // Polygon (non A-B-C-D) room — wires then run along its own perimeter
  const poly = useMemo(() => (isAbcdRoom(geometry) ? null : planPolygon(geometry)), [geometry])
  const perimM = poly ? poly.perimeter / 1000 : 2 * (W + D)
  const coordOf = useCallback((wallId: string, posMm: number): number | null => (
    poly ? polyPerimCoord(poly, wallId, posMm) : wirePerimCoord(wallId as WallId, posMm, W, D)
  ), [poly, W, D])

  // Compute effective wire config for each non-panel device
  const wireConfigs = useMemo<Record<string, WireConfig>>(() => {
    if (!panel) return {}
    const panC = coordOf(panel.wallId, panel.positionMm)
    if (panC === null) return {}
    const out: Record<string, WireConfig> = {}
    for (const el of electricals) {
      if (el.type === 'panel') continue
      const devC = coordOf(el.wallId, el.positionMm)
      if (devC === null) continue
      out[el.id] = {
        color: wireColors[el.id] ?? WIRE,
        cw:    wireRoutes[el.id] !== undefined ? wireRoutes[el.id] : shortestCW(devC, panC, perimM),
      }
    }
    return out
  }, [electricals, panel, wireColors, wireRoutes, coordOf, perimM])

  // Compute wire length (metres) for each non-panel device
  const wireLengths = useMemo<Record<string, number>>(() => {
    if (!panel) return {}
    const H = room.ceiling_height ?? 2.7
    const maxOpeningTopM = geometry.walls.reduce((acc, wall) =>
      wall.elements.reduce((wAcc, el) => Math.max(wAcc, ((el.sill_height ?? 0) + el.height) / 1000), acc)
    , 0)
    const wireChannelH = Math.min(H - 0.1, Math.max(maxOpeningTopM + 0.22, 2.25))
    const pdim = ELEC_DIMS_3D[panel.type]
    const panH = panel.heightMm / 1000 + pdim.h / 2
    const panC = coordOf(panel.wallId, panel.positionMm)
    if (panC === null) return {}
    const perim = perimM
    const out: Record<string, number> = {}
    for (const el of electricals) {
      if (el.type === 'panel') continue
      const cfg = wireConfigs[el.id]
      if (!cfg) continue
      const dim = ELEC_DIMS_3D[el.type]
      const devH = el.heightMm / 1000 + dim.h / 2
      const devC = coordOf(el.wallId, el.positionMm)
      if (devC === null) continue
      const perimDist = cfg.cw
        ? (panC - devC + perim) % perim
        : (devC - panC + perim) % perim
      const vertUp   = Math.max(0, wireChannelH - devH)
      const vertDown = Math.max(0, wireChannelH - panH)
      out[el.id] = Math.round((vertUp + perimDist + vertDown) * 100) / 100
    }
    return out
  }, [electricals, panel, wireConfigs, coordOf, perimM, room.ceiling_height, geometry])

  function handleRandomize() {
    const newColors: Record<string, string> = {}
    const newRoutes: Record<string, boolean> = {}
    for (const el of electricals) {
      if (el.type === 'panel') continue
      newColors[el.id] = WIRE_PALETTE[Math.floor(Math.random() * WIRE_PALETTE.length)]
      newRoutes[el.id] = Math.random() < 0.5
    }
    setWireColors(newColors)
    setWireRoutes(newRoutes)
  }

  function resetWires() {
    setWireColors({})
    setWireRoutes({})
  }

  function handleTabChange(t: TabId) {
    setTab(t)
    setActiveTool(null)
  }

  function handlePlaceElectrical(e: PlacedElectrical) {
    addElectrical(e)
    const cat = CATALOG.find(c => c.type === e.type)
    if (cat?.oneTime) setActiveTool(null)
  }

  const hasDevices = electricals.some(e => e.type !== 'panel')

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface border-b border-gray-200 text-xs shrink-0">
        {([
          ['elektr',    '⚡ Elektr qurilmalar'],
          ['chiroq',    '💡 Chiroqlar'],
          ['olchamlar', '📐 O\'lchamlar'],
        ] as [TabId, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`px-3 py-1 rounded-full font-medium transition-colors ${
              tab === t ? 'bg-brand text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        {tab === 'elektr' && hasDevices && panel && (
          <div className="flex items-center gap-1.5 ml-2">
            <button
              onClick={handleRandomize}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full font-medium bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
              title="Simlarni tasodifiy ranglash va yo'nalish o'zgartirish"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
                <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
              </svg>
              Simlarni aralash
            </button>
            {Object.keys(wireColors).length > 0 && (
              <button
                onClick={resetWires}
                className="px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                title="Standart rangga qaytarish"
              >Tiklash</button>
            )}
          </div>
        )}
        <span className="ml-auto text-gray-400">
          {tab === 'elektr' ? `${electricals.length} ta qurilma`
            : tab === 'chiroq' ? `${lights.length} ta chiroq`
            : `${electricals.length} ta o'lcham`}
        </span>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Plan + 3D wrapper — relative so the stories tab strip's corner
            arrows land at this content area's real corners (right arrow just
            left of the sidebar), not over the sidebar or the toolbar above. */}
        <div className="relative flex flex-1 min-w-0 min-h-0">
        <StudioTabStrip roomId={room.id} titleClassName="hidden sm:block" />
        {/* 2D/3D switch — same control and corner as the other sections. */}
        <div className="absolute top-16 right-3 z-20">
          <PlanViewToggle
            view={planView}
            onToggle={() => setPlanView((v) => (v === '3d' ? '2d' : '3d'))}
          />
        </div>
        {/* 2D floor plan */}
        <div className={`flex-1 min-h-0 overflow-auto flex items-start justify-center bg-paper p-4 ${planView === '2d' ? '' : 'hidden'}`}>
          <FloorPlan
            room={room}
            geometry={geometry}
            electricals={electricals}
            lights={lights}
            tab={tab}
            activeTool={activeTool}
            wireConfigs={wireConfigs}
            onPlaceElectrical={handlePlaceElectrical}
            onMoveElectrical={moveElectrical}
            onRemoveElectrical={removeElectrical}
            onPlaceLight={addLight}
            onRemoveLight={removeLight}
          />
        </div>

        {/* 3D view */}
        <div className={`flex-1 min-h-0 ${planView === '3d' ? '' : 'hidden'}`}>
          <ElektrThreeDView
            room={room}
            geometry={geometry}
            designState={designState}
            electricals={electricals}
            wireConfigs={wireConfigs}
          />
        </div>
        </div>

        {/* Sidebar */}
        {tab === 'elektr' ? (
          <ElektrSidebar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            electricals={electricals}
            onRemoveElectrical={removeElectrical}
          />
        ) : tab === 'chiroq' ? (
          <ChiroqSidebar lights={lights} onClearLights={clearLights}/>
        ) : (
          <OlchamlarSidebar electricals={electricals} wireLengths={wireLengths}/>
        )}
      </div>
    </div>
  )
}
