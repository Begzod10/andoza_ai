import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * What a selected surface looks like: a blue line round its edge, and
 * nothing on the surface itself.
 *
 * Walls, floors and ceilings used to be tinted blue all over (an emissive
 * glow, or a translucent plane laid on top), which hid the very finish the
 * user was choosing — "it should be blue line edge around only not surface".
 * Doors and windows already drew an edge; this is the same look for the rest.
 *
 * Drawn over everything (no depth test), so the line is never half-buried in
 * the surface it outlines, and a little off the surface anyway for the
 * z-fighting of the rest of the scene against it.
 */
const SELECTION_BLUE = "#2563EB";

export function SelectionOutline({ geometry, position, rotation }: {
  /** The surface's own geometry: its outer edges are the outline. */
  geometry: THREE.BufferGeometry;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
  useEffect(() => () => edges.dispose(), [edges]);
  return (
    <lineSegments geometry={edges} position={position} rotation={rotation} renderOrder={998}>
      <lineBasicMaterial color={SELECTION_BLUE} depthTest={false} transparent opacity={0.95} />
    </lineSegments>
  );
}

/** The outline of a `w` x `h` rectangle, in its own XY plane. */
export function RectOutline({ w, h, position, rotation }: {
  w: number; h: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const geo = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <SelectionOutline geometry={geo} position={position} rotation={rotation} />;
}
