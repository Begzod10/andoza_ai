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


// ─── Baseboard trim ────────────────────────────────────────────────────────────

/** Returns (centerLocal, segLen) pairs in meters, skipping floor-level openings. */
export function boardSegments(
  wallLenM: number,
  elements: WallElement[],
): Array<{ center: number; len: number }> {
  const wallLenMm = wallLenM * 1000;
  const BOARD_H_MM = 100; // keep in sync with Baseboard h = 0.1
  const resolved = resolveElementPositions(elements, wallLenMm);
  // The board must break at ANY opening that reaches the floor: doors,
  // balcony doors, and floor-to-ceiling windows (sill below board height).
  const cuts = resolved
    .filter(e => (e.sill_height ?? 0) < BOARD_H_MM)
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


// ─── Ceiling disk lights ──────────────────────────────────────────────────────

export function computeDiskLightPositions(W: number, D: number): [number, number][] {
  const minSpacing = 0.6;
  const usableX = W * 0.5;  // 25% offset from each side wall
  const usableZ = D * 0.5;
  const maxNx = Math.max(1, Math.floor(usableX / minSpacing) + 1);
  const maxNz = Math.max(1, Math.floor(usableZ / minSpacing) + 1);
  const target = Math.max(1, Math.round((W * D) / 4));
  const aspect = W / D;

  let bestNx = 1, bestNz = 1, bestScore = Infinity;
  for (let nx = 1; nx <= Math.min(target, maxNx); nx++) {
    for (const nz of [Math.round(target / nx), Math.ceil(target / nx)]) {
      if (nz < 1 || nz > maxNz) continue;
      const spacingX = nx === 1 ? Infinity : usableX / (nx - 1);
      const spacingZ = nz === 1 ? Infinity : usableZ / (nz - 1);
      if (spacingX < minSpacing || spacingZ < minSpacing) continue;
      const score = Math.abs(Math.log((nx / nz) / aspect)) + Math.abs(nx * nz - target) / target * 0.5;
      if (score < bestScore) { bestScore = score; bestNx = nx; bestNz = nz; }
    }
  }

  const positions: [number, number][] = [];
  for (let ix = 0; ix < bestNx; ix++) {
    const x = bestNx === 1 ? 0 : -usableX / 2 + ix * (usableX / (bestNx - 1));
    for (let iz = 0; iz < bestNz; iz++) {
      const z = bestNz === 1 ? 0 : -usableZ / 2 + iz * (usableZ / (bestNz - 1));
      positions.push([x, z]);
    }
  }
  return positions;
}


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
 * form a row along X, starting past every stored room's footprint — the same
 * origin the "+ add room" flow assumes for unpositioned anchors ONLY when
 * nothing else already claims it.
 *
 * A legacy row that always started back at x=0 used to land exactly on top
 * of a sibling that already has a real stored position there (the "two rooms
 * merged into one" bug) — any apartment with one positioned room and one
 * unpositioned room reproduced it, not just a specific stale pair.
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
  // far right their footprints reach so the legacy row can start beyond them.
  let storedMaxX = -Infinity;
  for (const r of rooms) {
    const stored = roomLayoutPos(r);
    if (!stored) continue;
    abs.set(r.id, stored);
    const { w } = roomFootprint(r, activeId, activeW, activeD);
    storedMaxX = Math.max(storedMaxX, stored.x + w / 2);
  }

  // Pass 2: lay out every remaining (unpositioned) room in a row. With no
  // stored rooms at all, the row starts at 0 (a lone unpositioned room reads
  // as the origin, same as before); otherwise it starts clear of them.
  let cursor = storedMaxX === -Infinity ? 0 : storedMaxX + GAP;
  let originOffset: number | null = null;
  for (const r of rooms) {
    if (abs.has(r.id)) continue;
    const { w } = roomFootprint(r, activeId, activeW, activeD);
    const slot = cursor + w / 2;
    cursor += w + GAP;
    if (storedMaxX === -Infinity) {
      // No anchor to measure from — keep the first legacy room at the origin.
      if (originOffset === null) originOffset = slot;
      abs.set(r.id, { x: slot - originOffset, z: 0 });
    } else {
      abs.set(r.id, { x: slot, z: 0 });
    }
  }
  return abs;
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
  const cx     = W * 0.34;          // ~34% from centre toward a side wall
  const cz     = D * 0.34;
  const lookH  = H * 0.42;          // look-at height (slightly below eye)
  switch (preset) {
    // Interior corner: standing near back-left, looking toward front-right
    case "corner": return {
      position: [-cx, eyeH, -cz] as [number,number,number],
      target:   [ cx * 0.3, lookH, cz * 0.3] as [number,number,number],
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
