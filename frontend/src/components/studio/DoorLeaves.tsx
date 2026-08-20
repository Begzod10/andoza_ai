import * as React from "react";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useRoomStore } from "@/store/roomStore";
import type { RoomGeometry, WallElement } from "@/store/roomStore";
import { resolveElementPositions } from "@/lib/wallPositions";
import { WINDOW_STYLES, layoutPanes, resolveWindowStyle } from "@/lib/windowStyles";
import { WindowElevation } from "@/features/studio/WindowElevation";

export type DoorToolMode = "select" | "move" | "rotate" | "scale";

const S = 1 / 1000;
const SNAP_MM = 5;
const LEAF_T = 0.04; // leaf thickness in metres
const GAP = 0.006; // clearance between leaf and frame
const SASH_T = 0.045; // window sash thickness
const BAR = 0.035; // sash rail width
const MUNTIN = 0.022; // glazing bar inside a pane (grid / arched head)

const MAX_SWING = 110;

/** Size envelopes differ per opening: a window may be short and wide, a door
 *  may not. Sill is only meaningful for a window — a door sits on the floor. */
const LIMITS = {
  door:   { minW: 500, maxW: 2400, minH: 1400, maxH: 2600, minSill: 0,  maxSill: 0    },
  window: { minW: 300, maxW: 3000, minH: 300,  maxH: 2400, minSill: 0,  maxSill: 1800 },
} as const;

const LEAF_COLORS = ["#C9A227", "#8B5E34", "#E8E2D8", "#5A5A5A", "#2F4858"];
const SASH_COLORS = ["#E8E2D8", "#FFFFFF", "#8B5E34", "#5A5A5A", "#2F4858"];

const PANEL_STYLE: React.CSSProperties = {
  pointerEvents: "all",
  width: 208,
  background: "rgba(255,255,255,0.97)",
  borderRadius: 12,
  boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
  padding: "10px 11px",
  fontSize: 11,
  color: "#374151",
  userSelect: "none",
};

const DELETE_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "5px 0",
  borderRadius: 8,
  cursor: "pointer",
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#DC2626",
  fontWeight: 600,
  fontSize: 11,
};

const snap = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Each wall gets a canonical frame: local +X runs along the wall, local +Z
 * points INTO the room. Doing the maths once here means the leaf, its hinge
 * and its swing are described in one orientation instead of four.
 */
interface WallFrame {
  id: string;
  yaw: number;
  cx: number;
  cz: number;
  /** 'X' walls run along world X, 'Z' walls along world Z. */
  axis: "X" | "Z";
  lengthM: number;
}

function wallFrames(W: number, D: number): WallFrame[] {
  return [
    { id: "A", yaw: 0, cx: 0, cz: -D / 2, axis: "X", lengthM: W },
    { id: "C", yaw: Math.PI, cx: 0, cz: D / 2, axis: "X", lengthM: W },
    { id: "B", yaw: -Math.PI / 2, cx: W / 2, cz: 0, axis: "Z", lengthM: D },
    { id: "D", yaw: Math.PI / 2, cx: -W / 2, cz: 0, axis: "Z", lengthM: D },
  ];
}

/** World-space centre of a door sitting at `position` mm along its wall. */
function openingCentre(wf: WallFrame, el: WallElement) {
  const offset = (el.position + el.width / 2 - wf.lengthM * 500) * S;
  return {
    x: wf.axis === "X" ? wf.cx + offset : wf.cx,
    z: wf.axis === "Z" ? wf.cz + offset : wf.cz,
  };
}

interface DragState {
  wallId: string;
  elId: string;
  mode: DoorToolMode;
  startPointer: { x: number; y: number };
  start: { position: number; width: number; height: number; openAngle: number; sill: number };
  /** mm of wall travel per screen pixel, measured at drag start. */
  mmPerPx: number;
}

export type OpeningKind = "door" | "window";

/** Doors and windows differ only in what hangs inside the frame — position,
 *  drag, resize, swing and selection are identical, so they share this layer. */
export function OpeningLeaves({
  kind,
  geometry,
  wallWidth,
  wallDepth,
  hiddenWalls,
  toolMode = "select",
  controlsRef,
  selectedId = null,
  onSelect,
  interactive = true,
}: {
  kind: OpeningKind;
  geometry: RoomGeometry;
  wallWidth: number;
  wallDepth: number;
  hiddenWalls?: ReadonlySet<string>;
  toolMode?: DoorToolMode;
  controlsRef?: React.RefObject<OrbitControlsImpl | null>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** False mounts the leaves as scenery: same geometry, no picking, no editor.
   *  This is what the walkthrough and the elektr preview want — they show the
   *  openings, they do not edit them. */
  interactive?: boolean;
}) {
  const lim = LIMITS[kind];
  const updateElement = useRoomStore((s) => s.updateElement);
  const removeElement = useRoomStore((s) => s.removeElement);
  const { camera, gl, size } = useThree();

  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const frames = useMemo(() => wallFrames(wallWidth, wallDepth), [wallWidth, wallDepth]);

  // Every door on every visible wall, already position-resolved
  const doors = useMemo(() => {
    const out: { wf: WallFrame; el: WallElement }[] = [];
    for (const wf of frames) {
      if (hiddenWalls?.has(wf.id)) continue;
      const wall = geometry.walls.find((w) => w.id === wf.id);
      if (!wall) continue;
      for (const el of resolveElementPositions(wall.elements, wf.lengthM * 1000)) {
        const isDoor = el.type === "eshik";
        if (isDoor === (kind === "door")) out.push({ wf, el });
      }
    }
    return out;
  }, [frames, geometry, hiddenWalls, kind]);

  /**
   * Screen-space scale for a drag: how many mm of wall one pixel covers at the
   * door's depth. Without this, dragging feels wildly fast up close and glacial
   * from across the room.
   */
  function mmPerPixel(worldPos: THREE.Vector3): number {
    const dist = camera.position.distanceTo(worldPos);
    const persp = camera as THREE.PerspectiveCamera;
    const fov = ((persp.fov ?? 45) * Math.PI) / 180;
    const worldPerPx = (2 * Math.tan(fov / 2) * dist) / size.height;
    return worldPerPx * 1000;
  }

  function beginDrag(wf: WallFrame, el: WallElement, e: ThreeEvent<PointerEvent>) {
    if (!interactive) return;
    if (toolMode === "select") {
      e.stopPropagation();
      onSelect?.(el.id);
      return;
    }
    e.stopPropagation();
    onSelect?.(el.id);
    const c = openingCentre(wf, el);
    dragRef.current = {
      wallId: wf.id,
      elId: el.id,
      mode: toolMode,
      startPointer: { x: e.clientX, y: e.clientY },
      start: {
        position: el.position,
        width: el.width,
        height: el.height,
        openAngle: el.openAngle ?? 0,
        sill: el.sill_height,
      },
      mmPerPx: mmPerPixel(new THREE.Vector3(c.x, el.height * S / 2, c.z)),
    };
    setDragging(true);
    if (controlsRef?.current) controlsRef.current.enabled = false;
    document.body.style.cursor = toolMode === "move" ? "grabbing" : "ns-resize";
  }

  useEffect(() => {
    if (!dragging) return;
    const canvas = gl.domElement;

    // Which screen direction "along the wall" points in, so a drag to the
    // right always moves the door right on screen regardless of wall or camera.
    const axisScreenSign = (wallId: string): number => {
      const wf = frames.find((f) => f.id === wallId);
      if (!wf) return 1;
      const axis = new THREE.Vector3(wf.axis === "X" ? 1 : 0, 0, wf.axis === "Z" ? 1 : 0);
      const origin = new THREE.Vector3(wf.cx, 1, wf.cz);
      const a = origin.clone().project(camera);
      const b = origin.clone().add(axis).project(camera);
      return b.x - a.x >= 0 ? 1 : -1;
    };

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dxPx = ev.clientX - d.startPointer.x;
      const dyPx = ev.clientY - d.startPointer.y;
      const wf = frames.find((f) => f.id === d.wallId);
      if (!wf) return;
      const wallLenMm = wf.lengthM * 1000;

      if (d.mode === "move") {
        const deltaMm = dxPx * d.mmPerPx * axisScreenSign(d.wallId);
        const next = clamp(snap(d.start.position + deltaMm), 0, Math.max(0, wallLenMm - d.start.width));
        updateElement(d.wallId, d.elId, { position: next });
      } else if (d.mode === "scale") {
        // Horizontal drag widens, vertical drag heightens — dragging UP grows.
        const wMm = clamp(snap(d.start.width + dxPx * d.mmPerPx * 2 * axisScreenSign(d.wallId)), lim.minW, lim.maxW);
        const hMm = clamp(snap(d.start.height - dyPx * d.mmPerPx * 2), lim.minH, lim.maxH);
        const pos = clamp(d.start.position, 0, Math.max(0, wallLenMm - wMm));
        updateElement(d.wallId, d.elId, { width: wMm, height: hMm, position: pos });
      } else if (d.mode === "rotate") {
        const deg = clamp(Math.round(d.start.openAngle + dxPx * 0.5), 0, MAX_SWING);
        updateElement(d.wallId, d.elId, { openAngle: deg });
      }
    };

    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      if (controlsRef?.current) controlsRef.current.enabled = true;
      document.body.style.cursor = "";
    };

    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, gl, camera, frames, updateElement, controlsRef, lim]);

  return (
    <>
      {doors.map(({ wf, el }) => {
        const common = {
          wf,
          el,
          // Scenery is never "selected" — that is what pulls up the editor panel
          selected: interactive && selectedId === el.id,
          toolMode,
          interactive,
          onPointerDown: (e: ThreeEvent<PointerEvent>) => beginDrag(wf, el, e),
          onPatch: (patch: Partial<WallElement>) => updateElement(wf.id, el.id, patch),
          onDelete: () => {
            onSelect?.(null);
            removeElement(wf.id, el.id);
          },
        };
        return kind === "door"
          ? <DoorLeaf key={`${wf.id}-${el.id}`} {...common} />
          : <WindowSash key={`${wf.id}-${el.id}`} {...common} />;
      })}
    </>
  );
}

function DoorLeaf({
  wf,
  el,
  selected,
  toolMode,
  interactive = true,
  onPointerDown,
  onPatch,
  onDelete,
}: {
  wf: WallFrame;
  el: WallElement;
  selected: boolean;
  toolMode: DoorToolMode;
  interactive?: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPatch: (patch: Partial<WallElement>) => void;
  onDelete: () => void;
}) {
  const c = openingCentre(wf, el);
  const w = el.width * S;
  const h = el.height * S;
  const sill = el.sill_height * S;

  const leafW = Math.max(0.1, w - GAP * 2);
  const leafH = Math.max(0.1, h - GAP);
  const hingeLeft = (el.hinge ?? "left") === "left";
  const angleDeg = el.openAngle ?? 0;

  // Hinge sits at one jamb; the leaf extends toward the other. Swinging the
  // free edge into the room is +θ from a right hinge, −θ from a left one.
  const hingeX = hingeLeft ? -w / 2 + GAP : w / 2 - GAP;
  const dir = hingeLeft ? 1 : -1;
  const swing = THREE.MathUtils.degToRad(angleDeg) * -dir;

  const woodColor = el.leafColor ?? "#8B5E34";
  // Scenery gets no hover affordance — nothing happens if you click it.
  const cursor = !interactive ? ""
    : toolMode === "select" ? "pointer"
    : toolMode === "move" ? "grab"
    : toolMode === "rotate" ? "ew-resize"
    : "ns-resize";

  return (
    <group position={[c.x, 0, c.z]} rotation={[0, wf.yaw, 0]}>
      {/* Hinge pivot — the whole leaf turns about this vertical edge */}
      <group position={[hingeX, 0, 0]} rotation={[0, swing, 0]}>
        <group position={[(dir * leafW) / 2, sill + leafH / 2, 0]}>
          <mesh
            castShadow
            receiveShadow
            onPointerDown={onPointerDown}
            onPointerEnter={() => { document.body.style.cursor = cursor; }}
            onPointerLeave={() => { document.body.style.cursor = ""; }}
          >
            <boxGeometry args={[leafW, leafH, LEAF_T]} />
            <meshStandardMaterial color={woodColor} roughness={0.55} metalness={0.05} />
          </mesh>

          {/* Two recessed panels per face — what reads as "a door" rather than a slab */}
          {[1, -1].map((face) => (
            <group key={face} position={[0, 0, (face * LEAF_T) / 2 + face * 0.001]}>
              {[0.26, -0.22].map((yFrac, i) => (
                <mesh key={i} position={[0, leafH * yFrac, 0]}>
                  <boxGeometry args={[leafW * 0.66, leafH * (i === 0 ? 0.34 : 0.38), 0.004]} />
                  <meshStandardMaterial color={woodColor} roughness={0.42} metalness={0.04} />
                </mesh>
              ))}
            </group>
          ))}

          {/* Handle on the FREE edge (opposite the hinge), at the usual 1.05 m.
              The lever points back toward the hinge, as a real one does. */}
          <group position={[dir * (leafW / 2 - 0.075), 1.05 - (sill + leafH / 2), 0]}>
            {[1, -1].map((face) => (
              <group key={face} position={[0, 0, face * (LEAF_T / 2 + 0.018)]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.017, 0.017, 0.036, 16]} />
                  <meshStandardMaterial color="#C0C4C8" roughness={0.28} metalness={0.85} />
                </mesh>
                <mesh position={[-dir * 0.05, 0, 0]}>
                  <boxGeometry args={[0.1, 0.022, 0.022]} />
                  <meshStandardMaterial color="#C0C4C8" roughness={0.28} metalness={0.85} />
                </mesh>
              </group>
            ))}
          </group>

          {selected && (
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(leafW + 0.02, leafH + 0.02, LEAF_T + 0.02)]} />
              <lineBasicMaterial color="#2563EB" />
            </lineSegments>
          )}
        </group>
      </group>

      {selected && (
        <Html
          position={[0, sill + h + 0.18, 0.02]}
          center
          zIndexRange={[120, 0]}
          style={{ pointerEvents: "none" }}
        >
          <DoorEditor el={el} onPatch={onPatch} onDelete={onDelete} />
        </Html>
      )}
    </group>
  );
}

/** Glass pane — shared by every sash so the look stays uniform. */
function Glass({ w, h }: { w: number; h: number }) {
  return (
    <mesh raycast={() => null}>
      <planeGeometry args={[Math.max(0.02, w), Math.max(0.02, h)]} />
      <meshPhysicalMaterial
        color="#B8D4EC"
        transparent
        opacity={0.18}
        roughness={0.04}
        metalness={0}
        envMapIntensity={0.9}
        clearcoat={0.6}
        clearcoatRoughness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * One pane of a window: its sash rails, the glass, and whatever divides it —
 * a muntin grid or the radial bars of an arched head. Rendered in the pane's
 * own centred frame; the caller places and (for an opening pane) swings it.
 */
function Pane({
  w,
  h,
  color,
  grid,
  fan,
  onPointerDown,
  cursor,
}: {
  w: number;
  h: number;
  color: string;
  grid?: [number, number];
  fan?: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  cursor: string;
}) {
  const glassW = Math.max(0.02, w - BAR * 2);
  const glassH = Math.max(0.02, h - BAR * 2);
  const barProps = {
    onPointerDown,
    onPointerEnter: () => { document.body.style.cursor = cursor; },
    onPointerLeave: () => { document.body.style.cursor = ""; },
  };

  // Radial bars of an arched head, drawn as an ellipse arc springing from the
  // pane's bottom corners. The reveal itself stays rectangular — same as the
  // arched windows on a real elevation sheet.
  const fanBars = useMemo(() => {
    if (!fan) return [];
    const rx = glassW / 2;
    const ry = glassH;
    const base = -h / 2 + BAR;
    const out: Array<{ p: [number, number, number]; r: number; len: number }> = [];
    const SEGS = 14;
    for (let i = 0; i < SEGS; i++) {
      const t0 = (Math.PI * i) / SEGS;
      const t1 = (Math.PI * (i + 1)) / SEGS;
      const x0 = -Math.cos(t0) * rx;
      const y0 = Math.sin(t0) * ry;
      const x1 = -Math.cos(t1) * rx;
      const y1 = Math.sin(t1) * ry;
      out.push({
        p: [(x0 + x1) / 2, base + (y0 + y1) / 2, 0],
        r: Math.atan2(y1 - y0, x1 - x0),
        len: Math.hypot(x1 - x0, y1 - y0) + MUNTIN,
      });
    }
    for (let k = 1; k <= 5; k++) {
      const t = (Math.PI * k) / 6;
      const x = -Math.cos(t) * rx;
      const y = Math.sin(t) * ry;
      out.push({
        p: [x / 2, base + y / 2, 0],
        r: Math.atan2(y, x),
        len: Math.hypot(x, y),
      });
    }
    return out;
  }, [fan, glassW, glassH, h]);

  return (
    <>
      {/* four sash rails */}
      {[
        { p: [0, h / 2 - BAR / 2, 0], a: [w, BAR, SASH_T] },
        { p: [0, -h / 2 + BAR / 2, 0], a: [w, BAR, SASH_T] },
        { p: [-w / 2 + BAR / 2, 0, 0], a: [BAR, h, SASH_T] },
        { p: [w / 2 - BAR / 2, 0, 0], a: [BAR, h, SASH_T] },
      ].map((bar, k) => (
        <mesh key={k} castShadow position={bar.p as [number, number, number]} {...barProps}>
          <boxGeometry args={bar.a as [number, number, number]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.08} />
        </mesh>
      ))}

      <Glass w={glassW} h={glassH} />

      {/* muntin grid */}
      {grid && !fan && (
        <>
          {Array.from({ length: Math.max(0, grid[0] - 1) }, (_, k) => (
            <mesh key={`v${k}`} position={[-glassW / 2 + (glassW / grid[0]) * (k + 1), 0, 0]}>
              <boxGeometry args={[MUNTIN, glassH, MUNTIN]} />
              <meshStandardMaterial color={color} roughness={0.5} metalness={0.08} />
            </mesh>
          ))}
          {Array.from({ length: Math.max(0, grid[1] - 1) }, (_, k) => (
            <mesh key={`h${k}`} position={[0, -glassH / 2 + (glassH / grid[1]) * (k + 1), 0]}>
              <boxGeometry args={[glassW, MUNTIN, MUNTIN]} />
              <meshStandardMaterial color={color} roughness={0.5} metalness={0.08} />
            </mesh>
          ))}
        </>
      )}

      {/* arched head */}
      {fanBars.map((b, k) => (
        <mesh key={`f${k}`} position={b.p} rotation={[0, 0, b.r]}>
          <boxGeometry args={[b.len, MUNTIN, MUNTIN]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.08} />
        </mesh>
      ))}
    </>
  );
}

/**
 * A window built from its style: bands of panes, the ones marked openable
 * swinging in on their own jamb, everything else fixed glass.
 */
function WindowSash({
  wf,
  el,
  selected,
  toolMode,
  interactive = true,
  onPointerDown,
  onPatch,
  onDelete,
}: {
  wf: WallFrame;
  el: WallElement;
  selected: boolean;
  toolMode: DoorToolMode;
  interactive?: boolean;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPatch: (patch: Partial<WallElement>) => void;
  onDelete: () => void;
}) {
  const c = openingCentre(wf, el);
  const w = el.width * S;
  const h = el.height * S;
  const sill = el.sill_height * S;
  const midY = sill + h / 2;

  const style = resolveWindowStyle(el);
  const panes = useMemo(() => layoutPanes(style), [style]);
  const soleOpen = panes.filter((p) => p.opens).length === 1;
  const angleDeg = el.openAngle ?? 0;
  const frameColor = el.leafColor ?? "#E8E2D8";

  const innerW = Math.max(0.08, w - GAP * 2);
  const innerH = Math.max(0.08, h - GAP * 2);

  // Scenery gets no hover affordance — nothing happens if you click it.
  const cursor = !interactive ? ""
    : toolMode === "select" ? "pointer"
    : toolMode === "move" ? "grab"
    : toolMode === "rotate" ? "ew-resize"
    : "ns-resize";

  return (
    <group position={[c.x, 0, c.z]} rotation={[0, wf.yaw, 0]}>
      {panes.map((pane, i) => {
        const pw = pane.w * innerW;
        const ph = pane.h * innerH;
        const px = pane.x * innerW;
        const py = midY + pane.y * innerH;
        const body = (
          <Pane
            w={pw}
            h={ph}
            color={frameColor}
            grid={pane.grid}
            fan={pane.fan}
            onPointerDown={onPointerDown}
            cursor={cursor}
          />
        );

        if (!pane.opens) {
          return (
            <group key={i} position={[px, py, 0]}>
              {body}
            </group>
          );
        }

        // Hinged on its outer jamb — a pair meets in the middle, as built.
        // The element's own hinge only applies to a single-leaf window; on a
        // pair it would hang both leaves on the same jamb, and they'd collide.
        // Same swing maths as the door leaf.
        const dir = (soleOpen ? el.hinge ?? pane.hinge : pane.hinge) === "left" ? 1 : -1;
        const hingeX = px - (dir * pw) / 2;
        const swing = THREE.MathUtils.degToRad(angleDeg) * -dir;
        return (
          <group key={i} position={[hingeX, 0, 0]} rotation={[0, swing, 0]}>
            <group position={[(dir * pw) / 2, py, 0]}>
              {body}
              {/* Handle on the free edge, at mid height */}
              <group position={[dir * (pw / 2 - 0.045), -ph * 0.05, SASH_T / 2 + 0.012]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.024, 12]} />
                  <meshStandardMaterial color="#B8BCC0" roughness={0.3} metalness={0.85} />
                </mesh>
                <mesh position={[0, -0.045, 0]}>
                  <boxGeometry args={[0.016, 0.09, 0.016]} />
                  <meshStandardMaterial color="#B8BCC0" roughness={0.3} metalness={0.85} />
                </mesh>
              </group>
            </group>
          </group>
        );
      })}

      {selected && (
        <lineSegments position={[0, midY, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(innerW, innerH, SASH_T + 0.02)]} />
          <lineBasicMaterial color="#2563EB" />
        </lineSegments>
      )}

      {selected && (
        <Html position={[0, sill + h + 0.18, 0.02]} center zIndexRange={[120, 0]} style={{ pointerEvents: "none" }}>
          <WindowEditor el={el} styleId={style.id} onPatch={onPatch} onDelete={onDelete} />
        </Html>
      )}
    </group>
  );
}

function WindowEditor({
  el,
  styleId,
  onPatch,
  onDelete,
}: {
  el: WallElement;
  styleId: string;
  onPatch: (patch: Partial<WallElement>) => void;
  onDelete: () => void;
}) {
  const lim = LIMITS.window;
  const angle = el.openAngle ?? 0;

  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={PANEL_STYLE}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <NumField label="Eni (mm)" value={el.width} min={lim.minW} max={lim.maxW}
          onCommit={(v) => onPatch({ width: snap(v) })} />
        <NumField label="Bo'yi (mm)" value={el.height} min={lim.minH} max={lim.maxH}
          onCommit={(v) => onPatch({ height: snap(v) })} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <NumField label="Pol'dan balandligi (mm)" value={el.sill_height} min={lim.minSill} max={lim.maxSill}
          onCommit={(v) => onPatch({ sill_height: snap(v) })} />
      </div>

      {/* Window type — scroll the strip and tap the one to build */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ color: "#6B7280", marginBottom: 3 }}>Deraza turi</div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4 }}>
          {WINDOW_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => onPatch({ styleId: s.id })}
              title={s.label}
              style={{
                flex: "0 0 auto", width: 44, height: 48, padding: 3, borderRadius: 8, cursor: "pointer",
                border: styleId === s.id ? "1.5px solid #2563EB" : "1px solid #E5E7EB",
                background: styleId === s.id ? "#EFF6FF" : "#fff",
              }}
            >
              <WindowElevation style={s} strokeWidth={0.9} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280", marginBottom: 2 }}>
          <span>Ochiq burchak</span><span style={{ fontWeight: 700, color: "#374151" }}>{angle}°</span>
        </div>
        <input
          type="range" min={0} max={MAX_SWING} step={1} value={angle}
          onChange={(e) => onPatch({ openAngle: Number(e.target.value) })}
          style={{ width: "100%", accentColor: "#2563EB", cursor: "pointer" }}
        />
      </div>

      <div style={{ marginBottom: 9 }}>
        <div style={{ color: "#6B7280", marginBottom: 4 }}>Rom rangi</div>
        <div style={{ display: "flex", gap: 5 }}>
          {SASH_COLORS.map((hex) => (
            <button
              key={hex}
              onClick={() => onPatch({ leafColor: hex })}
              title={hex}
              style={{
                width: 22, height: 22, borderRadius: "50%", background: hex, cursor: "pointer",
                border: (el.leafColor ?? "#E8E2D8") === hex ? "2.5px solid #2563EB" : "1px solid rgba(0,0,0,0.15)",
              }}
            />
          ))}
        </div>
      </div>

      <button onClick={onDelete} style={DELETE_STYLE}>O'chirish</button>
    </div>
  );
}

function DoorEditor({
  el,
  onPatch,
  onDelete,
}: {
  el: WallElement;
  onPatch: (patch: Partial<WallElement>) => void;
  onDelete: () => void;
}) {
  const angle = el.openAngle ?? 0;
  const hinge = el.hinge ?? "left";

  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={PANEL_STYLE}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <NumField label="Eni (mm)" value={el.width} min={LIMITS.door.minW} max={LIMITS.door.maxW}
          onCommit={(v) => onPatch({ width: snap(v) })} />
        <NumField label="Bo'yi (mm)" value={el.height} min={LIMITS.door.minH} max={LIMITS.door.maxH}
          onCommit={(v) => onPatch({ height: snap(v) })} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ color: "#6B7280", marginBottom: 3 }}>Ochilish tomoni</div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["left", "right"] as const).map((sideKey) => (
            <button
              key={sideKey}
              onClick={() => onPatch({ hinge: sideKey })}
              style={{
                flex: 1, padding: "4px 0", borderRadius: 7, cursor: "pointer",
                border: hinge === sideKey ? "1.5px solid #2563EB" : "1px solid #E5E7EB",
                background: hinge === sideKey ? "#EFF6FF" : "#fff",
                color: hinge === sideKey ? "#1D4ED8" : "#6B7280",
                fontWeight: hinge === sideKey ? 700 : 500, fontSize: 11,
              }}
            >
              {sideKey === "left" ? "Chap" : "O'ng"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#6B7280", marginBottom: 2 }}>
          <span>Ochiq burchak</span><span style={{ fontWeight: 700, color: "#374151" }}>{angle}°</span>
        </div>
        <input
          type="range" min={0} max={MAX_SWING} step={1} value={angle}
          onChange={(e) => onPatch({ openAngle: Number(e.target.value) })}
          style={{ width: "100%", accentColor: "#2563EB", cursor: "pointer" }}
        />
      </div>

      <div style={{ marginBottom: 9 }}>
        <div style={{ color: "#6B7280", marginBottom: 4 }}>Rangi</div>
        <div style={{ display: "flex", gap: 5 }}>
          {LEAF_COLORS.map((hex) => (
            <button
              key={hex}
              onClick={() => onPatch({ leafColor: hex })}
              title={hex}
              style={{
                width: 22, height: 22, borderRadius: "50%", background: hex, cursor: "pointer",
                border: (el.leafColor ?? "#8B5E34") === hex ? "2.5px solid #2563EB" : "1px solid rgba(0,0,0,0.15)",
              }}
            />
          ))}
        </div>
      </div>

      <button onClick={onDelete} style={DELETE_STYLE}>O'chirish</button>
    </div>
  );
}

function NumField({
  label, value, min, max, onCommit,
}: {
  label: string; value: number; min: number; max: number; onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const parsed = draft !== null ? parseFloat(draft) : NaN;
  const invalid = draft !== null && (isNaN(parsed) || parsed < min || parsed > max);

  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: "#6B7280", marginBottom: 3 }}>{label}</div>
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
        onBlur={() => {
          if (draft !== null && !isNaN(parsed) && parsed >= min && parsed <= max) onCommit(parsed);
          setDraft(null);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{
          width: "100%", padding: "3px 6px", borderRadius: 6, fontSize: 11, outline: "none",
          border: invalid ? "1px solid #F87171" : "1px solid #E5E7EB",
          background: invalid ? "#FEF2F2" : "#fff",
        }}
      />
    </div>
  );
}

export function DoorLeaves(props: Omit<React.ComponentProps<typeof OpeningLeaves>, "kind">) {
  return <OpeningLeaves kind="door" {...props} />;
}

export function WindowSashes(props: Omit<React.ComponentProps<typeof OpeningLeaves>, "kind">) {
  return <OpeningLeaves kind="window" {...props} />;
}
