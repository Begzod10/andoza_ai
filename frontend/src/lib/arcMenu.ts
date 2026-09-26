/**
 * Geometry and scroll maths for the corner arc menu — no React, no DOM, so it
 * can be tested directly. `components/studio/QuarterArcMenu.tsx` draws it.
 *
 * The arc runs from due left (180°) to straight up (270°): the quarter that
 * stays on screen from a bottom-right anchor, with y growing downward like the
 * screen does.
 */

/** Button diameters and ring radii, px. */
export const ARC_FAB = 52
export const ARC_ITEM = 54
export const ARC_RADIUS = 130
export const ARC_ITEM_OUTER = 50
export const ARC_RADIUS_OUTER = 190

export const ARC_START_DEG = 180
export const ARC_SWEEP_DEG = 90

export interface ArcPoint { dx: number; dy: number }

/** Where an angle on the arc falls, relative to the corner button's centre. */
export function arcPoint(deg: number, radius: number): ArcPoint {
  const rad = (deg * Math.PI) / 180
  return { dx: radius * Math.cos(rad), dy: radius * Math.sin(rad) }
}

/**
 * How many buttons fit on the quarter arc at a given radius without touching.
 * The arc's length grows with the radius, so the outer ring holds more than
 * the inner one.
 */
export function arcCapacity(radius: number, buttonSize: number, gap = 6): number {
  const arcLength = (radius * Math.PI) / 2
  return Math.max(1, Math.floor(arcLength / (buttonSize + gap)) + 1)
}

/** Degrees between two neighbouring slots once `capacity` of them fill the arc. */
export function arcSlotStep(capacity: number): number {
  return capacity <= 1 ? ARC_SWEEP_DEG : ARC_SWEEP_DEG / (capacity - 1)
}

/**
 * Positions for `n` items spread evenly across the whole quarter — used when
 * they all fit, so they sit balanced end to end rather than bunched at one
 * side. A lone item goes at the midpoint rather than at one end, so it reads as
 * deliberate instead of as the first of a row that never arrived.
 */
export function arcOffsets(n: number, radius = ARC_RADIUS): ArcPoint[] {
  if (n <= 0) return []
  return Array.from({ length: n }, (_, i) =>
    arcPoint(ARC_START_DEG + (n === 1 ? ARC_SWEEP_DEG / 2 : (ARC_SWEEP_DEG * i) / (n - 1)), radius),
  )
}

export interface ArcSlot extends ArcPoint {
  /** The item's index in the full list. */
  index: number
  /** Where it sits in slot units: 0 is the arc's left end, `capacity - 1` its
   *  top end. Fractional while a drag is in flight. */
  slot: number
  /**
   * The absolute turn-count position, which is what identifies a button while
   * the ring turns. The item index cannot: on a ring that wraps, one item can
   * occupy two places at once as the list comes back round, and keying by it
   * would collapse them into one.
   */
  key: number
  /** 1 in the middle of the arc, tapering to 0 just past either end, so items
   *  scrolling off fade instead of vanishing mid-stride. */
  opacity: number
}

/**
 * The items visible on a scrolling ring, given how far it has been dragged.
 *
 * The ring is endless: past the last item the list comes back round to the
 * first, so a sweep never runs into a dead stop and there is no "you are at
 * the end" to discover. Walking the SLOTS rather than the items is what makes
 * that work — each slot asks the list for whoever is at that position modulo
 * its length, so the list can be passed as many times as the finger likes.
 *
 * `offset` is in slot units — 1.0 means the list has advanced by one button.
 * Only the slots on the arc (plus a hair past each end, which is what fades)
 * are returned, so an 87-item library costs the same to draw as a 6-item one.
 */
export function arcSlots(count: number, capacity: number, offset: number, radius: number): ArcSlot[] {
  if (count <= 0) return []
  const step = arcSlotStep(capacity)
  const out: ArcSlot[] = []
  const first = Math.floor(offset) - 1
  for (let key = first; key <= first + capacity + 1; key++) {
    const slot = key - offset
    if (slot < -1 || slot > capacity) continue
    // Past either end the button is on its way out: fade it over the last
    // slot's worth of travel rather than popping it off.
    const overshoot = slot < 0 ? -slot : slot > capacity - 1 ? slot - (capacity - 1) : 0
    out.push({
      index: ((key % count) + count) % count,
      slot,
      key,
      opacity: Math.max(0, 1 - overshoot),
      ...arcPoint(ARC_START_DEG + slot * step, radius),
    })
  }
  return out
}

/** Whether a ring has more than it can show, and so scrolls at all. */
export function maxArcOffset(count: number, capacity: number): number {
  return Math.max(0, count - capacity)
}

/**
 * Keep the offset inside one lap of the list. Nothing is clamped — the ring
 * has no ends — this only stops a long run of sweeps growing the number
 * without bound, which would eventually cost it its precision.
 */
export function wrapArcOffset(offset: number, count: number): number {
  if (count <= 0) return 0
  return ((offset % count) + count) % count
}

/**
 * The angle of a point around the arc's centre, in the same frame as the slot
 * angles (degrees, y down). Unwrapped against `near` so a drag that crosses
 * the 180°/-180° seam reads as one continuous sweep instead of jumping a full
 * turn — without this, dragging past straight-up would fling the ring.
 */
export function angleAt(cx: number, cy: number, x: number, y: number, near = 225): number {
  const raw = (Math.atan2(y - cy, x - cx) * 180) / Math.PI
  let deg = raw
  while (deg - near > 180) deg -= 360
  while (near - deg > 180) deg += 360
  return deg
}

/**
 * Turning a drag along the arc into a scroll. Sweeping toward the top of the
 * arc carries the buttons with the finger, which means the list advances —
 * hence the sign flip.
 */
export function slotsFromAngleDelta(deltaDeg: number, capacity: number): number {
  return -deltaDeg / arcSlotStep(capacity)
}


/**
 * Which ring a touch belongs to, by how far from the corner button it landed.
 * The two rings scroll independently, so a drag has to commit to one at the
 * moment the finger goes down — and the fair boundary is halfway between them,
 * not the nearer button, which would hand a press in the empty gap to whatever
 * happened to be closest.
 */
export function ringAtDistance(distance: number, inner = ARC_RADIUS, outer = ARC_RADIUS_OUTER): 'inner' | 'outer' {
  return distance < (inner + outer) / 2 ? 'inner' : 'outer'
}

/** Distance from the arc's centre to a point, px. */
export function distanceFrom(cx: number, cy: number, x: number, y: number): number {
  return Math.hypot(x - cx, y - cy)
}
