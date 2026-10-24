import type { TKey } from '@/i18n'

/**
 * Window types — the shapes a "deraza" opening can take.
 *
 * A style is a stack of horizontal bands (top light / main sashes / apron),
 * each split into vertical panes. Panes may open, carry a muntin grid, or be
 * a fan-shaped arched head. One declarative spec drives everything: the plan
 * symbol, the picker thumbnails and the 3D sashes all lay out from
 * `layoutPanes`, so a style can never look like one window in 2D and another
 * in 3D.
 *
 * Coordinates from `layoutPanes` are fractions of the opening: x/y run
 * −0.5…0.5 (y up, like 3D), w/h are 0…1.
 */

export interface WindowBand {
  /** Height weight; bands are normalised against each other. */
  h: number
  /** Width weights of the panes across this band. */
  cols: number[]
  /** Indices of panes that swing open. Everything else is fixed glass. */
  opens?: number[]
  /** Muntin grid inside each pane of the band: [columns, rows]. */
  grid?: [number, number]
  /** Radial muntins — the arched-head look. */
  fan?: boolean
}

export interface WindowStyle {
  id: string
  /** Locale key of the label shown under the thumbnail. */
  labelKey: TKey
  /** Top band first. */
  bands: WindowBand[]
}

export interface Pane {
  /** Centre, as a fraction of the opening; y grows upward. */
  x: number
  y: number
  w: number
  h: number
  opens: boolean
  /** Hinge jamb for an opening pane. */
  hinge: 'left' | 'right'
  grid?: [number, number]
  fan?: boolean
}

export const WINDOW_STYLES: WindowStyle[] = [
  { id: 'single', labelKey: 'studio.lib.window.single', bands: [{ h: 1, cols: [1], opens: [0] }] },
  { id: 'double', labelKey: 'studio.lib.window.double', bands: [{ h: 1, cols: [1, 1], opens: [0, 1] }] },
  { id: 'triple', labelKey: 'studio.lib.window.triple', bands: [{ h: 1, cols: [1, 1, 1], opens: [0, 2] }] },
  { id: 'panorama', labelKey: 'studio.lib.window.panorama', bands: [{ h: 1, cols: [1, 2, 1], opens: [0, 2] }] },
  {
    id: 'transom2',
    labelKey: 'studio.lib.window.transom2',
    bands: [{ h: 0.3, cols: [1, 1] }, { h: 1, cols: [1, 1], opens: [0, 1] }],
  },
  {
    id: 'transom3',
    labelKey: 'studio.lib.window.transom3',
    bands: [{ h: 0.26, cols: [1, 1, 1] }, { h: 1, cols: [1, 1, 1], opens: [0, 2] }],
  },
  {
    id: 'transom_wide',
    labelKey: 'studio.lib.window.transom_wide',
    bands: [{ h: 0.22, cols: [1] }, { h: 1, cols: [1, 1], opens: [0, 1] }],
  },
  {
    id: 'apron2',
    labelKey: 'studio.lib.window.apron2',
    bands: [{ h: 1, cols: [1, 1], opens: [0, 1] }, { h: 0.3, cols: [1, 1] }],
  },
  {
    id: 'transom_apron',
    labelKey: 'studio.lib.window.transom_apron',
    bands: [
      { h: 0.22, cols: [1] },
      { h: 1, cols: [1, 1], opens: [0, 1] },
      { h: 0.26, cols: [1, 1] },
    ],
  },
  { id: 'grid6', labelKey: 'studio.lib.window.grid6', bands: [{ h: 1, cols: [1], opens: [0], grid: [2, 3] }] },
  {
    id: 'grid_double',
    labelKey: 'studio.lib.window.grid_double',
    bands: [{ h: 1, cols: [1, 1], opens: [0, 1], grid: [2, 3] }],
  },
  {
    id: 'colonial',
    labelKey: 'studio.lib.window.colonial',
    bands: [{ h: 1, cols: [1, 1], opens: [0, 1], grid: [3, 4] }],
  },
  {
    id: 'french',
    labelKey: 'studio.lib.window.french',
    bands: [{ h: 1, cols: [1, 1], opens: [0, 1], grid: [1, 4] }],
  },
  {
    id: 'sidelights',
    labelKey: 'studio.lib.window.sidelights',
    bands: [{ h: 1, cols: [0.55, 1.9, 0.55], opens: [1] }],
  },
  {
    id: 'studio',
    labelKey: 'studio.lib.window.studio',
    bands: [{ h: 1, cols: [1, 1, 1], opens: [1], grid: [2, 4] }],
  },
  {
    id: 'arch_fan',
    labelKey: 'studio.lib.window.arch_fan',
    bands: [{ h: 0.32, cols: [1], fan: true }, { h: 1, cols: [1, 1], opens: [0, 1] }],
  },
  {
    id: 'arch_single',
    labelKey: 'studio.lib.window.arch_single',
    bands: [{ h: 0.3, cols: [1], fan: true }, { h: 1, cols: [1], opens: [0], grid: [2, 3] }],
  },
  {
    id: 'arch_triple',
    labelKey: 'studio.lib.window.arch_triple',
    bands: [{ h: 0.34, cols: [1], fan: true }, { h: 1, cols: [1, 1, 1], opens: [0, 2] }],
  },
]

export const DEFAULT_WINDOW_STYLE = 'double'

export function findWindowStyle(id: string | undefined): WindowStyle | undefined {
  return id ? WINDOW_STYLES.find((s) => s.id === id) : undefined
}

/**
 * The style an opening is drawn with.
 *
 * Windows saved before styles existed carry only `sashes` (1 or 2, itself
 * defaulted by width), so they keep rendering exactly as they did.
 */
export function resolveWindowStyle(el: {
  styleId?: string
  sashes?: 1 | 2
  width: number
}): WindowStyle {
  const picked = findWindowStyle(el.styleId)
  if (picked) return picked
  const two = (el.sashes ?? (el.width >= 1000 ? 2 : 1)) === 2
  return findWindowStyle(two ? 'double' : 'single')!
}

/** Flatten a style into positioned panes. */
export function layoutPanes(style: WindowStyle): Pane[] {
  const totalH = style.bands.reduce((s, b) => s + b.h, 0) || 1
  const panes: Pane[] = []
  let top = 0.5 // walking down from the head
  for (const band of style.bands) {
    const bh = band.h / totalH
    const cy = top - bh / 2
    const totalW = band.cols.reduce((s, c) => s + c, 0) || 1
    let left = -0.5
    band.cols.forEach((col, i) => {
      const bw = col / totalW
      panes.push({
        x: left + bw / 2,
        y: cy,
        w: bw,
        h: bh,
        opens: (band.opens ?? []).includes(i),
        // Outermost panes hinge on their own jamb so a pair meets in the middle
        hinge: i >= band.cols.length / 2 ? 'right' : 'left',
        grid: band.grid,
        fan: band.fan,
      })
      left += bw
    })
    top -= bh
  }
  return panes
}

/** How many vertical divisions the widest band has — used by the plan symbol. */
export function mullionCount(style: WindowStyle): number {
  return Math.max(...style.bands.map((b) => b.cols.length)) - 1
}
