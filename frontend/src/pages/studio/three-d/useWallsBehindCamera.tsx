import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { RoomGeometry } from "@/store/roomStore";
import { wallDefsFromVertices } from "@/lib/wallDefsFromVertices";
import { wallMountFrame } from "@/lib/wallMountFrame";
import { wallsBehindCamera, sameWallSet, type WallPlane } from "@/lib/wallsFromCamera";

/**
 * The walls the camera is currently standing behind.
 *
 * Walls are single-sided, so from outside the room they are culled and simply
 * are not there — which is what lets you look into a flat from above. Their
 * doors, windows, skirting and faceplates are ordinary geometry, and stayed
 * hanging in mid-air once the wall had gone. This set is what those layers
 * follow, so a wall takes its furniture with it.
 *
 * Re-rendered only when the set actually changes, not every frame: the answer
 * holds for whole sweeps of an orbit, and the layers that read it are the
 * heaviest in the scene.
 */
export function useWallsBehindCamera(
  geometry: RoomGeometry,
  W: number,
  D: number,
): ReadonlySet<string> {
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

  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const live = useRef<ReadonlySet<string>>(hidden);

  useFrame(({ camera }) => {
    const next = wallsBehindCamera(planes, camera.position.x, camera.position.z, live.current);
    if (sameWallSet(next, live.current)) return;
    live.current = next;
    setHidden(next);
  });

  return hidden;
}
