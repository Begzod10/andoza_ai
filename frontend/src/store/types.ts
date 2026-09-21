// ─── Domain types ────────────────────────────────────────────────────────────
//
// Shared shapes for the room store. Split out of roomStore.ts so every slice
// (and every consumer importing a type from '@/store/roomStore') can depend
// on these without depending on the store's state/actions shape itself.

import type { FurnitureCategory, FurniturePlacement } from '@/lib/furnitureCatalog'
import type { CeilingDesignId, CeilingSettings } from '@/lib/ceilingDesigns'
import type { FloorPatternState } from '@/lib/floorGeometry'
import type { TrimState } from '@/lib/trimProfiles'

export interface WallElement {
  id: string
  type: 'eshik' | 'deraza' | 'balkon'
  width: number
  height: number
  sill_height: number
  /** Millimetres from the wall's position-0 end to the opening's LEFT EDGE —
   *  the low-position side, so the opening spans `position … position + width`.
   *  "Position 0" is `vertices[i]` for a polygon edge (planPolygon.ts), or the
   *  along-axis minimum for the legacy A/B/C/D rectangle.
   *
   *  NOT the same quantity as the API's `WallElement.position`, which is the
   *  opening's CENTRE as a 0..1 fraction (see backend/app/schemas/room.py).
   *  Left edge here because every consumer in the studio wants it — drag
   *  clamping, the panel/plank splitters, the overlap guides — and a centre
   *  would have them all add `width/2` back. Converted once at the API
   *  boundary by `apiPositionToStoreMm` / `storeElementToApiPosition`
   *  (lib/wallPositions.ts); nothing else should convert between the two. */
  position: number
  /** Whether `position` still needs auto-placement (centered/auto-spread by
   *  resolveElementPositions) rather than being honored as-is.
   *  `true` = not yet explicitly positioned by the user — auto-place it.
   *  `false`, or absent on an element with `position > 0` = explicit: honor
   *  `position` exactly, including a legitimate `0` (e.g. dragged flush into
   *  a corner). Absent on legacy elements saved before this flag existed —
   *  see resolveElementPositions in wallPositions.ts for the exact fallback
   *  rule that keeps their old behavior unchanged. */
  positionAuto?: boolean
  // ── Door leaf. All optional: openings saved before the 3D door existed
  //    carry none, and fall back to a closed, left-hung, wooden leaf. ──
  /** Hinge jamb, in the wall's own frame. */
  hinge?: 'left' | 'right'
  /** Swing in degrees into the room; 0 is shut. */
  openAngle?: number
  leafColor?: string
  /** Window only: number of casement leaves. Defaults by width. */
  sashes?: 1 | 2
  /** Window only: type id from the windowStyles catalog (sash/transom layout). */
  styleId?: string
}

export interface Wall {
  id: string
  length: number
  elements: WallElement[]
}

export interface RoomGeometry {
  walls: Wall[]
  /** Polygon vertices [x, z] in mm, counter-clockwise. Auto-populated for 4-wall rooms. */
  vertices?: [number, number][]
}

export type AppliedSurfaces = Record<string, string>

export type ElectricalType = 'switch1' | 'switch2' | 'socket1' | 'socket2' | 'socket_media' | 'panel'

export interface PlacedElectrical {
  id: string
  type: ElectricalType
  wallId: string
  positionMm: number
  heightMm: number
}

export interface PlacedLight {
  id: string
  xMm: number  // from left wall
  zMm: number  // from back wall
  /** Fixture kind from LIGHT_TYPES. Absent on lights saved before fixture
   *  types existed — those are plain ceiling lights (DEFAULT_LIGHT_TYPE). */
  type?: string
  /** Wall a wall-mounted fixture is fixed to. Any wall id, not just A-D: a
   *  drawn or scanned room's walls are W1..Wn. */
  wallId?: string
  /** Per-fixture overrides of the catalog defaults. Absent = use the default,
   *  so changing a catalog value still moves every light the user never
   *  touched. */
  dropM?: number
  wallHM?: number
  /** Aim of a directional fixture, radians about Y. */
  rotation?: number
  /** Tilt of an aimable beam off vertical, radians. */
  tiltRad?: number
  brightnessPct?: number
  colorK?: number
  beamDeg?: number
  /** Individually switched off while the room lights are on. */
  off?: boolean
}

export interface PlacedFurniture {
  id: string
  furniture_id: string
  x: number
  y: number
  rotation: number
  /** Uniform scale multiplier (1.0 = catalog default size). */
  scaleOverride?: number
  /** Per-material color tints (material name → hex). '*' = wildcard for all materials. */
  colorOverrides?: Record<string, string>
  /** Deleted/detached sub-object keys ("indexPath:name" from modelParts.ts) — pruned from the scene graph on load. */
  hiddenParts?: string[]
  /** Display name snapshot — set for user-uploaded models (see placeFurniture)
   *  so the backend smeta line reads "Jihoz: <name>" instead of a raw id. */
  name?: string
  /** Per-item price snapshot, so'm. Set for user-uploaded models at placement
   *  time (see placeFurniture) — there is no shared catalog slug to price a
   *  one-off upload by, so the price travels with the placed instance itself. */
  unitPriceUzs?: number
}

export interface UserFurnitureEntry {
  id: string
  name: string
  emoji: string
  blobId: string
  modelPath: string  // blob URL — restored from IndexedDB on startup
  /** Server row id once the model has been saved to the account (see
   *  uploadUserModel). Absent while the upload is in flight or failed —
   *  such an entry still works locally, it just isn't durable yet. */
  serverId?: string
  /** Absolute media URL of the server copy — the restore path when the
   *  IndexedDB copy is gone (cleared site data, another device). */
  remoteUrl?: string
  /** JPEG data URL preview rendered from the model itself at import time
   *  (see modelConverter.renderThumbnail). Absent for entries imported
   *  before this existed, or when the render failed — falls back to emoji. */
  thumbnailUrl?: string
  scale: number
  sizeM: { w: number; d: number; h: number }
  hasTextures: boolean
  /** Which catalog chip the model is filed under. Optional: entries persisted
   *  before categories existed have none, and are treated as 'boshqa'. */
  category?: FurnitureCategory
  /** Where the model sits once placed. Optional: entries persisted before
   *  this existed have none, and are treated as 'pol' (floor-standing). */
  placement?: FurniturePlacement
  /** Estimated price, so'm — editable by the user, defaulted by category at
   *  import time (see estimateFurniturePriceUzs). Carried onto each placed
   *  instance as PlacedFurniture.unitPriceUzs so the smeta/hisoblagich page
   *  can price a room's own uploaded furniture, not just the built-in catalog. */
  priceUzs?: number
}

export type FloorType = 'parquet' | 'tile' | 'laminate' | 'concrete'

/** Flat stand-in colour for plastered walls (2-D views, swatches, estimates). */
export const PLASTER_BASE_COLOR = '#7C7E80'

export type FloorState = 'xom_beton' | 'styajka' | 'qoplama_bor' | null

export type CeilingState = 'xom' | 'suvoq' | 'tayyor' | null

export type WallCovering =
  /** Raw plastered/concrete wall — how a room looks before any finishing. */
  | { kind: 'plaster' }
  | { kind: 'paint'; color: string }
  | { kind: 'oboy'; patternId: string; baseColor: string; accentColor: string }
  | { kind: 'texture'; url: string; color: string; repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number }

export interface WallPanelSettings {
  enabled: boolean
  width: number    // mm
  height: number   // mm
  depth: number    // mm
  rotation: number // 0 = vertical (portrait), 90 = horizontal (landscape)
  gap: number      // mm between panels
  chamfer: number  // mm edge bevel radius (0 = sharp)
  color: string    // hex
}

export interface FloorTextureSettings {
  repeatX: number
  repeatY: number
  offsetX: number
  offsetY: number
  rotation: number
}

export interface DesignState {
  wallCoverings: { ALL: WallCovering } & Partial<Record<string, WallCovering>>
  floorType: FloorType
  /** Set once the user actually visits Pol and picks something (handleSetFloorType).
   *  Until then floorType just holds the schema default ('parquet'), and the
   *  3D view renders a neutral placeholder instead of a full plank texture no
   *  one chose — see loadDraftState for how legacy rooms without this key
   *  are treated as already-configured so they don't lose their floor. */
  floorConfigured?: boolean
  wallPanels?: Partial<Record<string, WallPanelSettings>>
  floorTexture?: string | null
  floorTextureSettings?: FloorTextureSettings
  /** Real-geometry laying pattern for the floor (Naqsh — herringbone, chevron,
   *  Versailles, ...). Optional: rooms designed before the picker existed keep
   *  rendering the flat textured plane exactly as they always did. Persists
   *  like floorTexture: inside designState through both the localStorage
   *  partialize and the Saqlash state blob. */
  floorPattern?: FloorPatternState | null
  /** Floor skirting (plintus): which milled profile runs along the wall feet,
   *  and the height/width dialled for it. Three states, like floorPattern but
   *  with the opposite default:
   *    undefined — never touched, so the board renders with its default
   *                profile exactly as every room drew it before this picker
   *    null      — the user took the skirting off; nothing renders
   *    {...}     — that profile at those millimetres
   *  Persists inside designState through both the localStorage partialize and
   *  the Saqlash state blob. */
  skirting?: TrimState | null
  /** Ceiling cornice (galtel) — the moulding at the wall/ceiling junction.
   *  Same shape as `skirting`, but a plain absence means OFF: a cornice is
   *  something the user adds, not something every room already had. Only an
   *  explicit object puts one in the scene. */
  cornice?: TrimState | null
  floorState?: FloorState
  ceilingState?: CeilingState
  /** The ceiling profile and the numbers behind it. Optional: rooms designed
   *  before the picker existed read as the undropped slab they were drawn as. */
  ceiling?: { design: CeilingDesignId; settings?: Partial<CeilingSettings> }
}

/** Resolve the effective WallCovering for a given wall (falls back to ALL). */
export function resolveWallCovering(
  coverings: DesignState['wallCoverings'],
  wallId?: string,
): WallCovering {
  return (wallId ? coverings[wallId] : undefined) ?? coverings.ALL
}

/** Resolve the effective WallPanelSettings for a given wall (falls back to ALL). */
export function resolveWallPanel(
  panels: DesignState['wallPanels'],
  wallId?: string,
): WallPanelSettings | undefined {
  if (!panels) return undefined
  return (wallId ? panels[wallId] : undefined) ?? panels.ALL
}

/** Resolve just the paint color (or baseColor for oboy) for a wall. */
export function resolveWallColor(
  coverings: DesignState['wallCoverings'],
  wallId?: string,
): string {
  const c = resolveWallCovering(coverings, wallId)
  if (c.kind === 'plaster') return PLASTER_BASE_COLOR
  return c.kind === 'paint' ? c.color : c.kind === 'texture' ? c.color : c.baseColor
}

// ─── Payload shape from API ───────────────────────────────────────────────────

/**
 * What `loadRoom` accepts: the room exactly as the API sends it, NOT the
 * store's own shape. Every distance here is in METRES and every opening
 * `position` is a 0..1 CENTRE fraction; `loadRoom` is what converts them to
 * the store's millimetres and left edges.
 *
 * The two shapes are structurally identical and differ only in units, so
 * TypeScript happily accepts a store `RoomGeometry` here — which is how a
 * hand-drawn room and a LiDAR scan each shipped a 1000× room before their
 * builders were made to hand over `RoomPayloadGeometry`. Anything building a
 * room in millimetres must divide on the way in; prefer annotating the value
 * as `RoomPayloadGeometry` at the point it is built, so the unit is stated
 * where the numbers are, not only where they are consumed.
 */
export interface RoomPayloadGeometry {
  walls: Array<{
    id: string
    /** Wall length in METRES. */
    length: number
    elements?: Array<{
      type: string
      /** Opening width in METRES. */
      width: number
      /** Opening height in METRES. */
      height: number
      /** Floor-to-sill distance in METRES. */
      sill_height?: number | null
      /** Opening CENTRE as a 0..1 fraction of the wall's length. */
      position?: number | null
      style_id?: string | null
      sashes?: number | null
    }>
  }>
  /** Polygon corners as [x, z] in METRES, counter-clockwise. */
  vertices?: [number, number][]
}

export interface RoomPayload {
  id?: string
  apartment_id?: string | null
  name?: string
  /** Ceiling height in METRES. */
  ceiling_h?: number | null
  geometry?: RoomPayloadGeometry | null
  /** Wall/floor → real do'kon Material id links (see applySurface). Restored
   * on load so a room reopened on a different device/browser keeps its
   * paint/wallpaper/floor material pricing instead of starting blank. */
  surfaces?: Record<string, unknown> | null
}
