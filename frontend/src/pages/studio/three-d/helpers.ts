import * as THREE from "three";
import type { Room } from "@/lib/api";
import type { WallElement, WallCovering } from "@/store/roomStore";
import { resolveElementPositions } from "@/lib/wallPositions";
import type { RoomSide, ViewPreset } from "./constants";

/**
 * Small pure helpers (math, formatting, lookups) shared across the 3D
 * studio's room-rendering components. Split out of ThreeDPage.tsx — see
 * that file's header comment for the full picture.
 */

export function shadeHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const sh = (v: number) => Math.round(v * factor).toString(16).padStart(2, "0");
  return `#${sh(r)}${sh(g)}${sh(b)}`;
}


// ─── Trim runs (skirting / cornice) ───────────────────────────────────────────

/**
 * Split a wall into the runs a trim actually occupies, breaking wherever an
 * opening crosses the trim's own vertical band.
 *
 * Both bands are measured in mm from the floor: a skirting occupies
 * [0, height], a cornice [junction - height, junction]. An opening breaks the
 * run when the two overlap — a door interrupts a skirting, a floor-to-ceiling
 * window interrupts both, and an ordinary window at sill height interrupts
 * neither.
 *
 * Returns (centerLocal, segLen) pairs in metres, centres measured along the
 * wall from its midpoint.
 */
export function trimSegments(
  wallLenM: number,
  elements: WallElement[],
  bandBottomMm: number,
  bandTopMm: number,
): Array<{ center: number; len: number }> {
  const wallLenMm = wallLenM * 1000;
  const resolved = resolveElementPositions(elements, wallLenMm);
  const cuts = resolved
    .filter((e) => {
      const sill = e.sill_height ?? 0;
      return sill < bandTopMm && sill + e.height > bandBottomMm;
    })
    .sort((a, b) => a.position - b.position);

  if (cuts.length === 0) return [{ center: 0, len: wallLenM }];

  const segs: Array<{ center: number; len: number }> = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.position > cursor) {
      const lenMm = cut.position - cursor;
      segs.push({ center: ((cursor + cut.position) / 2 - wallLenMm / 2) / 1000, len: lenMm / 1000 });
    }
    cursor = Math.max(cursor, cut.position + cut.width);
  }
  if (cursor < wallLenMm) {
    segs.push({ center: ((cursor + wallLenMm) / 2 - wallLenMm / 2) / 1000, len: (wallLenMm - cursor) / 1000 });
  }
  return segs;
}

/** The skirting's band: from the floor up to the board's height. */
export function boardSegments(
  wallLenM: number,
  elements: WallElement[],
  /** Board height in mm — decides which openings reach it. Defaults to the
   *  studio's classic 100 mm board for callers that render a fixed one. */
  boardHeightMm = 100,
): Array<{ center: number; len: number }> {
  return trimSegments(wallLenM, elements, 0, boardHeightMm);
}


// ─── Ceiling lights ───────────────────────────────────────────────────────────
// The room's default ceiling lamps used to be laid out here, by a
// `computeDiskLightPositions(W, D)` that only ever saw the room's bounding box
// and built a grid about the world origin — right for a legacy A-B-C-D
// rectangle, wrong for every drawn or scanned polygon, whose outline is
// centred on its vertex mean instead. That, plus the way a handful of the grid
// were pooled into real lights, is what the user saw as lamps "bunched into a
// corner". The layout now comes from the room's real outline; it lives in
// `lib/defaultRoomLights.ts`, with tests, and is rendered by `CeilingLights`.


// ─── Draggable electrical items (3D) ─────────────────────────────────────────

export function getWallPlane(wallId: 'A' | 'B' | 'C' | 'D', W: number, D: number): THREE.Plane {
  switch (wallId) {
    case 'A': return new THREE.Plane(new THREE.Vector3(0, 0, 1),  D / 2)
    case 'C': return new THREE.Plane(new THREE.Vector3(0, 0, -1), D / 2)
    case 'D': return new THREE.Plane(new THREE.Vector3(1, 0, 0),  W / 2)
    case 'B': return new THREE.Plane(new THREE.Vector3(-1, 0, 0), W / 2)
  }
}


/** Fractional hours as a wall clock — 13.25 → "13:15". */
export function formatClock(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}


/**
 * Room names can contain spaces, apostrophes and other characters that are
 * unsafe (or just ugly) in a downloaded filename — strip anything outside
 * a conservative safe set and collapse the rest to single dashes.
 */
export function slugifyFileName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'xona'
}


export function roomFootprint(r: Room, activeId: string, activeW: number, activeD: number): { w: number; d: number } {
  if (r.id === activeId) return { w: activeW, d: activeD };
  // Must match roomExtents()'s convention (lib/roomDims.ts): wall A → W,
  // wall B → D. This used to be swapped, which desynced from the aw/ad the
  // "+ add room" flow sends via roomExtents() in handleAddRoom below —
  // adjacent rooms in the same apartment could compute a gap that was
  // actually a geometric overlap (this exact apartment: -3.65 vs two 4.0m-
  // deep rooms, a 0.35m intrusion — the two-rooms-overlap render bug).
  const wallA = r.geometry?.walls?.find((w) => w.id === 'A');
  const wallB = r.geometry?.walls?.find((w) => w.id === 'B');
  return { w: wallA?.length ?? 4, d: wallB?.length ?? 3 };
}


export function roomLayoutPos(r: Room | undefined): { x: number; z: number } | undefined {
  const p = (r?.state as { layoutPos?: { x: number; z: number } } | null | undefined)?.layoutPos;
  return p && Number.isFinite(p.x) && Number.isFinite(p.z) ? p : undefined;
}


/**
 * Absolute apartment position for every room, in ONE shared frame:
 * rooms with a stored layoutPos use it verbatim; legacy rooms (no position)
 * are packed into a block that starts past every stored room's footprint —
 * the same origin the "+ add room" flow assumes for unpositioned anchors ONLY
 * when nothing else already claims it.
 *
 * A legacy row that always started back at x=0 used to land exactly on top
 * of a sibling that already has a real stored position there (the "two rooms
 * merged into one" bug) — any apartment with one positioned room and one
 * unpositioned room reproduced it, not just a specific stale pair. So the
 * fallback has to stay clear of the stored footprints along x; that part is
 * load-bearing and must not be reverted.
 *
 * What it must NOT do is stretch to the horizon or sit off on its own. The
 * apartment the "my first room disappeared" report came from has six rooms
 * with stored positions marching along x to 17.89, all at z = 4.55, and nine
 * rooms with no position at all. A single unbounded row at z = 0 put those
 * nine in a 32-metre conga line reaching x ≈ 50, in a band 4.55 m away from
 * the real flat — a flat 53 m long and 8.6 m deep, read as a corridor rather
 * than a home, and the zoom-out limit (which is fitted to the whole flat) had
 * to allow 98 m, where one 3.5 m room is under 3% of the frame. Two rules
 * bring that to a 32 x 12 m block and a 60 m limit instead:
 *
 *  - the block continues the flat's own band — it inherits the z of the
 *    stored room it starts next to, rather than defaulting to z = 0;
 *  - it wraps into a roughly square grid instead of one endless row, so N
 *    legacy rooms grow as sqrt(N) in each direction.
 */
export function computeAbsolutePositions(
  rooms: Room[],
  activeId: string,
  activeW: number,
  activeD: number,
): Map<string, { x: number; z: number }> {
  // Matches persistLayoutPos's GAP in WizardPage.tsx — rooms should read as
  // adjacent (touching walls), not detached with a dead strip of floor
  // between them.
  const GAP = 0.02;
  const abs = new Map<string, { x: number; z: number }>();

  // Pass 1: place every room that already has a real position, and note how
  // far right their footprints reach so the legacy block can start beyond
  // them — and at what z, so it continues their band instead of starting a
  // second one.
  let storedMaxX = -Infinity;
  let storedEdgeZ = 0;
  for (const r of rooms) {
    const stored = roomLayoutPos(r);
    if (!stored) continue;
    abs.set(r.id, stored);
    const { w } = roomFootprint(r, activeId, activeW, activeD);
    const reach = stored.x + w / 2;
    if (reach > storedMaxX) {
      storedMaxX = reach;
      storedEdgeZ = stored.z;
    }
  }

  // Pass 2: pack every remaining (unpositioned) room into a grid. With no
  // stored rooms at all, it starts at the origin (a lone unpositioned room
  // reads as the origin, same as before); otherwise it starts clear of them.
  const legacy = rooms.filter((r) => !abs.has(r.id));
  if (legacy.length === 0) return abs;

  const sizes = legacy.map((r) => roomFootprint(r, activeId, activeW, activeD));
  // One pitch for every row, taken from the deepest room in the block: a
  // per-row pitch would let a shallow row be followed by a deep one that
  // reaches back into it.
  const rowPitch = Math.max(...sizes.map((s) => s.d)) + GAP;
  // sqrt, so the block is about as wide as it is deep. ceil keeps a single
  // legacy room in a single 1x1 "grid", i.e. exactly where it used to go.
  const cols = Math.max(1, Math.ceil(Math.sqrt(legacy.length)));
  const anchored = storedMaxX !== -Infinity;
  const startX = anchored ? storedMaxX + GAP : 0;
  const startZ = anchored ? storedEdgeZ : 0;

  let cursor = startX;
  let col = 0;
  let row = 0;
  // With nothing stored to measure from, the first legacy room has to come
  // out at the origin itself, so the whole block is shifted by that room's
  // own half-width.
  let originOffset: number | null = anchored ? 0 : null;
  legacy.forEach((r, i) => {
    if (col === cols) { col = 0; row += 1; cursor = startX; }
    const { w } = sizes[i];
    const slot = cursor + w / 2;
    cursor += w + GAP;
    col += 1;
    if (originOffset === null) originOffset = slot;
    abs.set(r.id, { x: slot - originOffset, z: startZ + row * rowPitch });
  });
  return abs;
}


/**
 * How far the whole flat reaches around the active room, metres.
 *
 * The zoom-out limit was fitted to the ACTIVE room — correct when it was the
 * only thing on screen, and wrong the moment the neighbours started being
 * drawn: the camera stopped the instant one room filled the frame, so the
 * rooms next door were rendered somewhere the user could not pull back far
 * enough to see. "Where is my old room" was partly that.
 *
 * Returns a full span about the active room's own centre — twice the furthest
 * reach on each axis — because that centre is what the camera orbits, and
 * `fitRoomDistance` turns the span into the radius of the sphere it has to
 * contain. A real bounding box would be tighter but wrong here: a flat that
 * reaches 30 m west of the active room still needs 30 m of radius, whichever
 * side the camera happens to be orbiting on.
 *
 * Lives beside `computeAbsolutePositions` rather than in the component file
 * so it can be tested without pulling the whole R3F tree into the test.
 */
export function flatExtent(
  rooms: Room[] | undefined,
  activeId: string,
  activeW: number,
  activeD: number,
  activePos: { x: number; z: number } | null,
): { W: number; D: number } {
  if (!rooms || rooms.length < 2) return { W: activeW, D: activeD };
  const abs = computeAbsolutePositions(rooms, activeId, activeW, activeD);
  const anchor = activePos ?? abs.get(activeId) ?? { x: 0, z: 0 };
  let reachX = activeW / 2;
  let reachZ = activeD / 2;
  for (const r of rooms) {
    const { w, d } = roomFootprint(r, activeId, activeW, activeD);
    const p = abs.get(r.id) ?? { x: 0, z: 0 };
    reachX = Math.max(reachX, Math.abs(p.x - anchor.x) + w / 2);
    reachZ = Math.max(reachZ, Math.abs(p.z - anchor.z) + d / 2);
  }
  // Doubled because the caller wants a full span about the centre, the same
  // shape as the room's own W/D.
  return { W: reachX * 2, D: reachZ * 2 };
}


/**
 * Which cardinal sides of the active room already have a sibling on them —
 * so AddRoomButtons can skip that side's "+" instead of stacking it right
 * on top of a room that's already there.
 */
export function computeOccupiedSides(
  rooms: Room[],
  activeId: string,
  activeW: number,
  activeD: number,
  activePos: { x: number; z: number } | null,
): Set<RoomSide> {
  if (rooms.length < 2) return new Set();
  const abs = computeAbsolutePositions(rooms, activeId, activeW, activeD);
  const anchor = activePos ?? abs.get(activeId) ?? { x: 0, z: 0 };
  const occupied = new Set<RoomSide>();
  for (const r of rooms) {
    if (r.id === activeId) continue;
    const p = abs.get(r.id) ?? { x: 0, z: 0 };
    const dx = p.x - anchor.x;
    const dz = p.z - anchor.z;
    // Whichever axis has the larger offset is the side this room sits on —
    // matches how persistLayoutPos only ever offsets along one axis per side.
    if (Math.abs(dz) >= Math.abs(dx)) {
      occupied.add(dz < 0 ? 'north' : 'south');
    } else {
      occupied.add(dx < 0 ? 'west' : 'east');
    }
  }
  return occupied;
}


// ─── Full room scene ──────────────────────────────────────────────────────────

export function shadeCovering(covering: WallCovering, factor: number): WallCovering {
  // Plaster carries no colour of its own — the PBR maps and the scene lights
  // do the shading, so a per-wall tint here would only fight them.
  if (covering.kind === 'plaster') return covering
  if (covering.kind === 'paint') {
    return { kind: 'paint', color: shadeHex(covering.color, factor) }
  }
  if (covering.kind === 'texture') {
    return { ...covering }
  }
  // For oboy, shade the baseColor only (accent stays vivid)
  return { ...covering, baseColor: shadeHex(covering.baseColor, factor) }
}


/*
 * All perspective presets place the camera INSIDE the room so only the
 * interior wall faces (facing toward the camera) are ever visible — like
 * 3ds Max backface culling.  The orbit radius is clamped to ≤ 88% of the
 * shortest half-dimension so the user can never drag the camera outside.
 *
 * Top view is the only mode that lifts the camera above the room; it is
 * treated as an architectural plan view and gets a relaxed maxDistance.
 */
export function getCamera(preset: ViewPreset, W: number, D: number, H: number) {
  const eyeH  = H * 0.56;          // eye-level height inside the room
  const cz     = D * 0.34;
  const lookH  = H * 0.42;          // look-at height (slightly below eye)
  switch (preset) {
    // Overview: above the back-left corner, looking down across the room at
    // its middle. Both far walls, the floor and what stands on it are in view
    // at once. The camera sits a hair beyond the corner and above the walls —
    // they are single-sided, so the two it is behind are simply not drawn (see
    // useWallsBehindCamera) and nothing blocks the view. Looking steeply down
    // matters: from eye height the floor is seen at a grazing angle, where it
    // mirrors the bright sky and washes out, hiding the very boards being chosen.
    case "corner": return {
      position: [-W * 0.52, H * 1.05, -D * 0.52] as [number,number,number],
      target:   [ W * 0.04, H * 0.22,  D * 0.04] as [number,number,number],
    };
    // Front wall: standing near front, looking toward back
    case "front": return {
      position: [0, eyeH,  cz] as [number,number,number],
      target:   [0, lookH, -cz * 0.4] as [number,number,number],
    };
    // Back wall: standing near back, looking toward front
    case "back": return {
      position: [0, eyeH,  -cz] as [number,number,number],
      target:   [0, lookH,  cz * 0.4] as [number,number,number],
    };
    // Top / plan view — aerial only
    case "top": return {
      position: [W * 0.08, H * 3.5, 0] as [number,number,number],
      target:   [0, 0, 0]               as [number,number,number],
    };
  }
}


/**
 * Push a framing away from its target so a narrower canvas still shows the
 * whole room.
 *
 * The presets above are written in room units only, so they implicitly assume
 * the wide 3D-tab canvas. The Mebelirovka tab gives the viewport roughly half
 * that width, and a perspective camera's horizontal field of view shrinks with
 * the aspect ratio — same pose, less room visible. Scaling the eye-to-target
 * distance restores the framing. The result is capped at `maxDist` because
 * OrbitControls clamps beyond it, and a target the animator can never reach
 * would leave it lerping forever.
 */
export function fitFramingToAspect(
  cam: { position: [number, number, number]; target: [number, number, number] },
  scale: number,
  maxDist: number,
) {
  if (scale <= 1) return cam;
  const [px, py, pz] = cam.position;
  const [tx, ty, tz] = cam.target;
  const dx = px - tx, dy = py - ty, dz = pz - tz;
  const dist = Math.hypot(dx, dy, dz);
  if (dist === 0) return cam;
  const s = Math.min(dist * scale, maxDist * 0.98) / dist;
  return {
    position: [tx + dx * s, ty + dy * s, tz + dz * s] as [number, number, number],
    target: cam.target,
  };
}
