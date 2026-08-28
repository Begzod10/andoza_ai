/**
 * Placed furniture drawn on the 2D floor plan (Mebelirovka tab).
 *
 * Each item is the orthographic top view of the very same GLB the 3D viewport
 * renders — outer border plus the edges where the model's height steps, traced
 * from above (see `modelTopView`). Same model cache, same placement maths, so
 * what the plan draws is what the 3D shows, seen from the top.
 *
 * While the model loads (or if it fails / has no blob yet after a refresh) its
 * bounding rectangle stands in, so an item is never missing from the plan.
 */
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { FURNITURE_CATALOG, type FurnitureCatalogEntry } from '@/lib/furnitureCatalog'
import type { PlacedFurniture, UserFurnitureEntry } from '@/store/roomStore'
import { rectHull, type Hull } from '@/lib/modelFootprint'
import { topViewOutline, topViewPoints, type Poly, type TopView } from '@/lib/modelTopView'

export type AnyFurnitureEntry = FurnitureCatalogEntry | UserFurnitureEntry

export function resolveFurnitureEntry(
  furnitureId: string,
  userFurniture: UserFurnitureEntry[],
): AnyFurnitureEntry | undefined {
  return (
    FURNITURE_CATALOG.find((f) => f.id === furnitureId) ??
    userFurniture.find((f) => f.id === furnitureId)
  )
}

const OUTLINE = '#3F3A33'
const DETAIL = '#7A7264'
const SELECT = '#D85A30'

/** Item scale in metres per model unit (catalog unit scale × user resize). */
export function itemScale(entry: AnyFurnitureEntry, item: PlacedFurniture): number {
  return entry.scale * (item.scaleOverride ?? 1)
}

interface ShapeProps {
  item: PlacedFurniture
  entry: AnyFurnitureEntry
  selected: boolean
  /** Plan-space centre of the item, mm. */
  cx: number
  cy: number
  onHull(id: string, hull: Hull): void
  onPointerDown(e: React.PointerEvent): void
}

/** Model-space polylines → one SVG path in plan millimetres. */
function pathData(polys: Poly[], s: number): string {
  return polys
    .map(
      (poly) =>
        poly.map(([x, z], i) => `${i === 0 ? 'M' : 'L'}${(x * s).toFixed(1)},${(z * s).toFixed(1)}`).join('') +
        'Z',
    )
    .join('')
}

/** The drawn symbol, once the model has been traced. */
function PlanSymbol({
  item,
  entry,
  selected,
  cx,
  cy,
  view,
  schematic,
  onHull,
  onPointerDown,
}: ShapeProps & { view: TopView; schematic: boolean }) {
  const points = useMemo(() => topViewPoints(view), [view])

  useEffect(() => {
    if (points.length >= 3) onHull(item.id, points)
  }, [item.id, points, onHull])

  const s = itemScale(entry, item) * 1000 // model units → mm
  const deg = (-item.rotation * 180) / Math.PI // SVG turns the other way to THREE's +Y yaw
  const outline = pathData(view.outline, s)
  const details = pathData(view.details, s)

  return (
    <g style={{ cursor: 'grab' }} onPointerDown={onPointerDown}>
      <g transform={`translate(${cx} ${cy}) rotate(${deg.toFixed(2)})`}>
        <path
          d={outline}
          fillRule="evenodd"
          fill={selected ? '#FBE3D6' : '#FFFFFF'}
          fillOpacity={selected ? 0.95 : 0.86}
          stroke={selected ? SELECT : OUTLINE}
          strokeWidth={selected ? 40 : 24}
          strokeLinejoin="round"
        />
        {details && (
          <path
            d={details}
            fill="none"
            stroke={selected ? SELECT : DETAIL}
            strokeWidth={selected ? 22 : 15}
            strokeLinejoin="round"
            pointerEvents="none"
          />
        )}
      </g>
      {/* The traced shape speaks for itself; the emoji only stands in for a
          model that hasn't been traced yet. */}
      {schematic && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={220}
          pointerEvents="none"
        >
          {entry.emoji}
        </text>
      )}
    </g>
  )
}

/** Bounding rectangle — used until the GLB is available. */
function BoxSymbol(props: ShapeProps) {
  const { entry } = props
  const view = useMemo(
    () => ({ outline: [rectHull(entry.sizeM.w / entry.scale, entry.sizeM.d / entry.scale)], details: [] }),
    [entry.sizeM.w, entry.sizeM.d, entry.scale],
  )
  return <PlanSymbol {...props} view={view} schematic />
}

/** The real thing: traced from the loaded model. */
function ModelSymbol(props: ShapeProps) {
  const { entry } = props
  const { scene } = useGLTF(entry.modelPath)
  const view = useMemo(
    () => topViewOutline(scene as THREE.Object3D, entry.modelPath),
    [scene, entry.modelPath],
  )
  if (view.outline.length === 0) return <BoxSymbol {...props} />
  return <PlanSymbol {...props} view={view} schematic={false} />
}

/**
 * A broken or evicted model must not take the plan down with it — the plan is
 * also the door/window editor. Falls back to the box symbol.
 */
class SymbolBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function PlanFurnitureLayer({
  furniture,
  userFurniture,
  W,
  Dp,
  selectedId,
  onHull,
  onPointerDownItem,
}: {
  furniture: PlacedFurniture[]
  userFurniture: UserFurnitureEntry[]
  /** Interior room width/depth in mm — furniture coords are centred on the room. */
  W: number
  Dp: number
  selectedId: string | null
  onHull(id: string, hull: Hull): void
  onPointerDownItem(item: PlacedFurniture, e: React.PointerEvent): void
}) {
  return (
    <g>
      {furniture.map((item) => {
        const entry = resolveFurnitureEntry(item.furniture_id, userFurniture)
        if (!entry) return null
        const shared: ShapeProps = {
          item,
          entry,
          selected: selectedId === item.id,
          cx: item.x + W / 2,
          cy: item.y + Dp / 2,
          onHull,
          onPointerDown: (e) => onPointerDownItem(item, e),
        }
        const box = <BoxSymbol {...shared} />
        // No path yet (blob URLs are dropped on reload until IndexedDB restores
        // them) — the box keeps the item visible and draggable meanwhile.
        if (!entry.modelPath) return <g key={item.id}>{box}</g>
        return (
          <g key={item.id}>
            <SymbolBoundary fallback={box}>
              <Suspense fallback={box}>
                <ModelSymbol {...shared} />
              </Suspense>
            </SymbolBoundary>
          </g>
        )
      })}
    </g>
  )
}
