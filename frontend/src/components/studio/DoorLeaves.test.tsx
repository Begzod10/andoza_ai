import { describe, it, expect } from "vitest";
import { wallFramesFromVertices, openingCentre } from "./DoorLeaves";

/**
 * Real production geometry (room 32df8c3b-baa6-496c-905a-15d8d265b804), a
 * LiDAR-scanned 5-wall room. Not one edge is axis-aligned, which is exactly
 * the case the old axis/face/leftAlong approximation got wrong.
 * Vertices are millimetres, as `geometry.vertices` always is.
 */
const VERTS: [number, number][] = [
  [3224.2, 0],
  [7864.9, 3217.2],
  [8268.5, 4499.2],
  [5501.9, 8475.8],
  [0, 4646.6],
];
const IDS = ["w0", "w1", "w2", "w3", "w4"];

/** Same centroid-centring every renderer in this app applies (metres). */
function centred(): [number, number][] {
  const n = VERTS.length;
  const cx = VERTS.reduce((s, [x]) => s + x, 0) / n / 1000;
  const cz = VERTS.reduce((s, [, z]) => s + z, 0) / n / 1000;
  return VERTS.map(([x, z]) => [x / 1000 - cx, z / 1000 - cz]);
}

describe("wallFramesFromVertices", () => {
  const frames = wallFramesFromVertices(VERTS, IDS);
  const pts = centred();

  it("gives one frame per edge, with the edge's true length", () => {
    expect(frames.map((f) => f.id)).toEqual(IDS);
    const expected = [5.65, 1.34, 4.84, 6.70, 5.66];
    frames.forEach((f, i) => expect(f.lengthM).toBeCloseTo(expected[i], 2));
  });

  it("centres each frame on the edge midpoint and aligns it with the edge", () => {
    frames.forEach((f, i) => {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[(i + 1) % pts.length];
      expect(f.cx).toBeCloseTo((x1 + x2) / 2, 6);
      expect(f.cz).toBeCloseTo((z1 + z2) / 2, 6);
      const len = Math.hypot(x2 - x1, z2 - z1);
      expect(f.ux).toBeCloseTo((x2 - x1) / len, 6);
      expect(f.uz).toBeCloseTo((z2 - z1) / len, 6);
      expect(Math.hypot(f.ux, f.uz)).toBeCloseTo(1, 9);
      // Ry(yaw) maps local +X to (cos yaw, 0, -sin yaw); for this
      // counter-clockwise polygon that must be the edge direction itself.
      expect(Math.cos(f.yaw)).toBeCloseTo(f.ux, 6);
      expect(-Math.sin(f.yaw)).toBeCloseTo(f.uz, 6);
      // ...and local +Z, the leaf's "into the room" axis, must point inward:
      // the room is centred on the origin, so that is toward (0, 0).
      const nx = Math.sin(f.yaw);
      const nz = Math.cos(f.yaw);
      expect(nx * -f.cx + nz * -f.cz).toBeGreaterThan(0);
    });
  });
});

describe("openingCentre", () => {
  const frames = wallFramesFromVertices(VERTS, IDS);
  const pts = centred();

  /** Lies on the segment v_i → v_{i+1}, at the opening's fractional position. */
  const expectOnWall = (
    wallIndex: number,
    el: { position: number; width: number },
  ) => {
    const f = frames[wallIndex]!;
    const c = openingCentre(f, el);
    const [x1, z1] = pts[wallIndex];
    const [x2, z2] = pts[(wallIndex + 1) % pts.length];
    const t = (el.position + el.width / 2) / (f.lengthM * 1000);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(c.x).toBeCloseTo(x1 + (x2 - x1) * t, 6);
    expect(c.z).toBeCloseTo(z1 + (z2 - z1) * t, 6);
    // and therefore exactly on the wall's line: zero perpendicular offset.
    const perp = (c.x - x1) * f.uz - (c.z - z1) * f.ux;
    expect(perp).toBeCloseTo(0, 9);
  };

  // `position` here is millimetres along the wall, which is what roomStore
  // hands this layer: the API stores it as a FRACTION of the wall (0.40 and
  // 0.91 for this room) and the store multiplies it by the wall length.
  it("puts the scanned room's window on wall 2, in its opening", () => {
    expectOnWall(2, { position: 1936, width: 3840 }); // 0.40 x 4.844 m
  });

  it("puts the scanned room's door on wall 3, in its opening", () => {
    expectOnWall(3, { position: 6097, width: 1190 }); // 0.91 x 6.703 m
  });

  it("keeps a 0-position opening at the wall's start vertex", () => {
    const f = frames[0]!;
    const c = openingCentre(f, { position: 0, width: 0 });
    expect(c.x).toBeCloseTo(pts[0][0], 6);
    expect(c.z).toBeCloseTo(pts[0][1], 6);
  });
});
