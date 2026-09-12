/**
 * Live-drag position for a wall opening (window/door/balcony) currently being
 * dragged in WallOpenings.tsx, shared with the components that render the
 * ACTUAL visible model — WindowFrames/DoorFrames (WallComponents.tsx) and
 * OpeningLeaves's DoorLeaf/WindowSash (DoorLeaves.tsx) — so they can track the
 * cursor live instead of only jumping to the new spot on pointerup.
 *
 * This is a plain module-level mutable singleton, not React state/context and
 * not a Zustand store slice: it is only ever read inside each consumer's own
 * `useFrame` callback, never in JSX, so writing to it must NOT trigger any
 * re-render or subscriber notification. WallOpenings.tsx already re-renders
 * itself every pointermove (via its own `setGuides` call) and keeps its own
 * private `liveDragRef` for its own visuals (hit-plane, selection border,
 * dimension labels) — this singleton is a second, identical-value write
 * target for the other consumers that live outside WallOpenings.tsx's own
 * subtree, added alongside `liveDragRef`, not a replacement for it.
 *
 * The whole drag gesture still commits to the Zustand `geometry` store
 * exactly ONCE, on pointerup (see WallOpenings.tsx's `onUp`) — this singleton
 * never touches the store.
 */
export interface LiveOpeningDrag {
  wallId: string
  elId: string
  /** mm along the wall from its left edge — same convention as WallElement.position. */
  position: number
  /** mm above the floor — same convention as WallElement.sill_height. */
  sill_height: number
}

export const liveOpeningDrag: { current: LiveOpeningDrag | null } = { current: null }
