// ─── Design state helpers & defaults ──────────────────────────────────────────
//
// Pure functions and the default DesignState — no store state involved.
// Split out of roomStore.ts (and used by designSlice) so they can be unit
// tested independently of the Zustand wiring.

import { DEFAULT_CEILING_DESIGN } from '@/lib/ceilingDesigns'
import type { DesignState, WallCovering } from '../types'

/**
 * Largest inline image kept in the persisted draft, in characters.
 *
 * A photo pasted in as a data URL routinely runs to several megabytes, and
 * localStorage gives the whole origin about five. Writing one in throws
 * QuotaExceededError, which fails the *entire* snapshot — so keeping a big
 * texture would cost the user their furniture, lights and geometry too.
 * Dropping it is the cheaper loss, and it still comes back from the backend
 * once the room is saved.
 *
 * Generated finishes (a few KB of SVG) and server-hosted URLs are far below
 * this, so the ordinary case always survives a reload.
 */
const MAX_INLINE_IMAGE = 64 * 1024

function isOversizedInline(url?: string | null): boolean {
  return !!url && url.startsWith('data:') && url.length > MAX_INLINE_IMAGE
}

export const DEFAULT_DESIGN_STATE: DesignState = {
  // A brand-new room starts as bare stretcher-bond brick (user's decision,
  // 2026-09-16) — the real state of a flat before any finishing work, and the
  // baseline every phase builds on. The texture ships with the app; the
  // Belcrest 500 Stretcher tile maps to 1000 × 1000 mm of wall per the user's
  // explicit UVW spec (2026-09-19), so repeatX 1.0 (tiles-per-metre, = 1/1.0)
  // renders bricks at true scale; the image is square, so repeatY 1.0
  // preserves the 1 m vertical span.
  wallCoverings: {
    ALL: {
      kind: 'texture',
      url: '/textures/brick_stretcher.jpg',
      color: '#ffffff',
      repeatX: 1.0,
      repeatY: 1.0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    },
  },
  floorType: 'parquet',
  floorConfigured: false,
  ceiling: { design: DEFAULT_CEILING_DESIGN },
  wallPanels: {
    ALL: {
      enabled: false,
      width: 300,
      height: 600,
      depth: 20,
      rotation: 0,
      gap: 10,
      chamfer: 0,
      color: '#D4C5B0',
    },
  },
}

/** Design state trimmed to what is safe to write to localStorage. */
export function persistableDesignState(d: DesignState): DesignState {
  const entries = Object.entries(d.wallCoverings).map(([wallId, covering]) => {
    if (covering && covering.kind === 'texture' && isOversizedInline(covering.url)) {
      return [wallId, DEFAULT_DESIGN_STATE.wallCoverings.ALL] as const
    }
    return [wallId, covering] as const
  })
  return {
    ...d,
    wallCoverings: Object.fromEntries(entries) as DesignState['wallCoverings'],
    floorTexture: isOversizedInline(d.floorTexture) ? null : d.floorTexture,
  }
}

/*
 * Repair texture UV numbers that came from an older writer.
 *
 * Downstream, `repeatX` is tiles per metre and `repeatY` a vertical stretch on
 * top of the image's aspect. An earlier Suvoq path wrote tiles-per-wall into
 * `repeatX`, and derived `repeatY` from a ceiling height it treated as metres
 * while the store keeps millimetres — so a 3 m room stored repeatY = 1500 and
 * the wall rendered as hairlines in both the 3D and the isometric view.
 *
 * A person cannot pick anything near these bounds through the UI, so a value
 * outside them is that bug rather than a choice, and resetting it is what makes
 * an already-saved room render again instead of staying broken forever.
 */
const UV_MIN = 0.02
const UV_MAX = 60
const DEFAULT_TILE_M = 2.4

function repairCovering(covering: WallCovering): WallCovering {
  if (covering.kind !== 'texture') return covering
  const sane = (v: number) => Number.isFinite(v) && v >= UV_MIN && v <= UV_MAX
  if (sane(covering.repeatX) && sane(covering.repeatY)) return covering
  return { ...covering, repeatX: 1 / DEFAULT_TILE_M, repeatY: 1 }
}

/** Every wall's covering, with out-of-range UV numbers repaired. */
export function repairDesignState(d: DesignState): DesignState {
  return {
    ...d,
    wallCoverings: Object.fromEntries(
      Object.entries(d.wallCoverings).map(([wallId, covering]) => [
        wallId,
        covering ? repairCovering(covering) : covering,
      ]),
    ) as DesignState['wallCoverings'],
  }
}
