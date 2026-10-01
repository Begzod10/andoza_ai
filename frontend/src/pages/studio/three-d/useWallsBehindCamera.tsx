import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RoomGeometry } from "@/store/roomStore";
import { wallDefsFromVertices } from "@/lib/wallDefsFromVertices";
import { wallMountFrame } from "@/lib/wallMountFrame";
import { wallsBehindCamera, sameWallSet, type WallPlane } from "@/lib/wallsFromCamera";

/**
 * Reports which walls the camera is currently standing behind.
 *
 * Walls are single-sided, so from outside the room they are culled and simply
 * are not there — which is what lets you look into a flat from above. Their
 * doors, windows, skirting and faceplates are ordinary geometry, and hung in
 * mid-air once the wall had gone. This is what those layers follow, so a wall
 * takes its furniture with it.
 *
 * A COMPONENT rather than a hook, and that is the whole point: it reads the
 * camera every frame, and `useFrame` only works inside the <Canvas>. The set
 * is wanted by layers that are siblings of the canvas's own tree, so the state
 * lives in the parent and this reports into it — a hook called beside the
 * <Canvas> is outside R3F's context and throws on mount.
 *
 * Reports only when the answer changes, not every frame: it holds for whole
 * sweeps of an orbit, and the layers reading it are the heaviest in the scene.
 */
export function WallsBehindCamera({ geometry, W, D, onChange }: {
  geometry: RoomGeometry;
  W: number;
  D: number;
  onChange: (hidden: ReadonlySet<string>) => void;
}) {
  const planes = useMemo<WallPlane[]>(() => {
    const polyDefs = geometry.vertices && geometry.vertices.length >= 3
      ? wallDefsFromVertices(geometry.vertices, geometry.walls.map((w) => w.id))
      : {};
    const out: WallPlane[] = [];
    for (const wall of geometry.walls) {
      const f = wallMountFrame(wall.id, W, D, polyDefs);
      if (f) out.push({ id: wall.id, midX: f.midX, midZ: f.midZ, nx: f.nx, nz: f.nz });
    }
    return out;
  }, [geometry, W, D]);

  const live = useRef<ReadonlySet<string>>(new Set());

  useFrame(({ camera }) => {
    const next = wallsBehindCamera(planes, camera.position.x, camera.position.z, live.current);
    if (sameWallSet(next, live.current)) return;
    live.current = next;
    onChange(next);
  });

  return null;
}
