import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useViewLockStore } from "@/store/viewLockStore";

/**
 * Moving rooms in the 3D view with X / Z arrows (lib/moveRoom has the
 * geometry) — the user's option A. A button beside the lock turns move mode
 * on; a tap on a room selects it and lays a red (X) and a blue (Z) arrow
 * across its floor; dragging an arrow moves the room along it. A drag that
 * starts anywhere else still turns the view.
 */

/** Hands the scene's camera to code outside the canvas that has to move it
 *  (moving the open room re-anchors the flat). */
export function CameraRefBridge({ cameraRef }: { cameraRef: { current: THREE.Camera | null } }) {
  const camera = useThree((s) => s.camera);
  cameraRef.current = camera;
  return null;
}

export interface MoveTarget { id: string; cx: number; cz: number; w: number; d: number }

/** How far either side of an arrow's line still grabs it, metres — a finger,
 *  not a cursor. */
const GRAB_M = 0.35;

/** The arrows' half-lengths on a room. */
function arrowReach(t: MoveTarget) {
  // Short of the wall handles, which sit HANDLE_INSET_M in from each wall.
  return { x: Math.max(0.4, t.w / 2 - 0.75), z: Math.max(0.4, t.d / 2 - 0.75) };
}

/** How far in from its wall a resize handle sits, metres. */
const HANDLE_INSET_M = 0.3;
export type WallSide = 'A' | 'B' | 'C' | 'D';
/** Where each wall's resize handle sits: A at −z, B at +x, C at +z, D at −x. */
export function handlePoints(t: MoveTarget): { side: WallSide; x: number; z: number }[] {
  return [
    { side: 'A', x: t.cx, z: t.cz - t.d / 2 + HANDLE_INSET_M },
    { side: 'B', x: t.cx + t.w / 2 - HANDLE_INSET_M, z: t.cz },
    { side: 'C', x: t.cx, z: t.cz + t.d / 2 - HANDLE_INSET_M },
    { side: 'D', x: t.cx - t.w / 2 + HANDLE_INSET_M, z: t.cz },
  ];
}

/**
 * The input side of move mode. Listened for on the canvas's wrapper in the
 * CAPTURE phase, so a press on an arrow is taken before the orbit controls
 * see it — and only that press: anything else falls through to them, so the
 * view still turns. A short tap (no drag) selects the room under it, or
 * clears the selection on empty floor. The scene's own pointer events are off
 * meanwhile, so no wall ring or door panel answers.
 */
export function RoomMoveInput({ rooms, selected, axis, resizable, onSelect, onDrag, onDragEnd, onResize, onResizeEnd }: {
  rooms: readonly MoveTarget[];
  /** The selected room as it stands now (live). */
  selected: MoveTarget | null;
  /** The one direction it moves in — along the wall it shares with its
   *  neighbour; null when it stands against none. */
  axis: 'x' | 'z' | null;
  onSelect: (id: string | null) => void;
  onDrag: (delta: number) => void;
  onDragEnd: () => void;
  /** Whether the selected room's walls can be dragged to resize it. */
  resizable: boolean;
  /** A wall handle dragged by `delta` metres along its axis (outwards for B
   *  and C, which face +x and +z). */
  onResize: (side: WallSide, delta: number) => void;
  onResizeEnd: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const set = useThree((s) => s.set);
  const latest = useRef({ rooms, selected, axis, resizable, onSelect, onDrag, onDragEnd, onResize, onResizeEnd });
  latest.current = { rooms, selected, axis, resizable, onSelect, onDrag, onDragEnd, onResize, onResizeEnd };

  useEffect(() => {
    set((st) => ({ events: { ...st.events, enabled: false } }));
    const host = gl.domElement.parentElement;
    if (!host) return;
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ground = (e: PointerEvent): THREE.Vector3 | null => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(floor, p) ? p : null;
    };
    let drag: { pointer: number; axis: 'x' | 'z'; start: THREE.Vector3; side?: WallSide } | null = null;
    let tap: { pointer: number; x: number; y: number } | null = null;

    const down = (e: PointerEvent) => {
      if (drag || e.target !== gl.domElement) return;
      const p = ground(e);
      const { selected: sel, axis, resizable } = latest.current;
      // A wall handle first: it sits where the arrow does not reach.
      if (p && sel && resizable) {
        const h = handlePoints(sel).find((hp) => Math.hypot(p.x - hp.x, p.z - hp.z) < GRAB_M);
        if (h) {
          e.stopPropagation();
          drag = { pointer: e.pointerId, axis: h.side === 'B' || h.side === 'D' ? 'x' : 'z', start: p, side: h.side };
          return;
        }
      }
      if (p && sel && axis) {
        const along = axis === 'x' ? p.x - sel.cx : p.z - sel.cz;
        const across = axis === 'x' ? p.z - sel.cz : p.x - sel.cx;
        const reach = arrowReach(sel)[axis];
        if (Math.abs(across) < GRAB_M && Math.abs(along) <= reach + 0.3) {
          e.stopPropagation();
          drag = { pointer: e.pointerId, axis, start: p };
          return;
        }
      }
      tap = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.pointer) {
        e.stopPropagation();
        const p = ground(e);
        const d = p ? (drag.axis === 'x' ? p.x - drag.start.x : p.z - drag.start.z) : null;
        if (d !== null) {
          if (drag.side) latest.current.onResize(drag.side, d);
          else latest.current.onDrag(d);
        }
      } else if (tap && e.pointerId === tap.pointer && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) {
        tap = null; // it was the view being turned
      }
    };
    const up = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.pointer) {
        const wasResize = !!drag.side;
        drag = null;
        if (wasResize) latest.current.onResizeEnd(); else latest.current.onDragEnd();
        return;
      }
      if (tap && e.pointerId === tap.pointer) {
        tap = null;
        const p = ground(e);
        const hit = p && latest.current.rooms.find((r) => Math.abs(p.x - r.cx) <= r.w / 2 && Math.abs(p.z - r.cz) <= r.d / 2);
        latest.current.onSelect(hit ? hit.id : null);
      }
    };
    host.addEventListener('pointerdown', down, { capture: true });
    window.addEventListener('pointermove', move, { capture: true });
    window.addEventListener('pointerup', up, { capture: true });
    window.addEventListener('pointercancel', up, { capture: true });
    return () => {
      host.removeEventListener('pointerdown', down, { capture: true });
      window.removeEventListener('pointermove', move, { capture: true });
      window.removeEventListener('pointerup', up, { capture: true });
      window.removeEventListener('pointercancel', up, { capture: true });
      // Back as the lock has it, not simply on.
      set((st) => ({ events: { ...st.events, enabled: !useViewLockStore.getState().locked } }));
    };
  }, [gl, camera, set]);
  return null;
}

/** One double-headed arrow lying on the floor. */
function FloorArrow({ axis, reach, color }: { axis: 'x' | 'z'; reach: number; color: string }) {
  const rotY = axis === 'x' ? 0 : Math.PI / 2;
  return (
    <group rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[reach * 2 - 0.3, 0.07]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (reach - 0.12), 0, 0]} rotation={[0, 0, -s * Math.PI / 2]}>
          <coneGeometry args={[0.12, 0.26, 3]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** The selected room's arrow, along the wall it shares with its neighbour —
 *  the one direction it moves in; the gap across is typed (`GapField`). */
export function RoomMoveArrows({ target, axis }: { target: MoveTarget; axis: 'x' | 'z' }) {
  const reach = arrowReach(target);
  return (
    <group position={[target.cx, 0.06, target.cz]} renderOrder={999}>
      <FloorArrow axis={axis} reach={reach[axis]} color="#E5484D" />
    </group>
  );
}

/**
 * The dimensions either side of a shared door while its room moves — from
 * each of the door's edges to the moving room's wall end on that side, the
 * way a selected door shows its 0.80 m / 1.30 m.
 */
export function DoorDimensions({ axis, lineAcross, room, doors, height = 1.3 }: {
  axis: 'x' | 'z';
  /** Where the partition runs, across the axis. */
  lineAcross: number;
  /** The moving room's wall along the axis, live. */
  room: [number, number];
  /** Door spans along the axis, live; [] for none. */
  doors: [number, number][];
  height?: number;
}) {
  const at = (along: number): [number, number, number] =>
    axis === 'x' ? [along, height, lineAcross] : [lineAcross, height, along];
  const items: { a: number; b: number }[] = [];
  for (const [d0, d1] of doors) {
    items.push({ a: room[0], b: d0 }, { a: d1, b: room[1] });
  }
  return (
    <>
      {items.map(({ a, b }, i) => (
        <group key={i}>
          <DimLine from={at(a)} to={at(b)} />
          <Html position={at((a + b) / 2)} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
            <span style={{
              padding: '2px 7px', borderRadius: 999, background: 'rgba(17,24,39,0.85)', color: '#fff',
              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            }}>
              {(Math.max(0, b - a)).toFixed(2)} m
            </span>
          </Html>
        </group>
      ))}
    </>
  );
}

function DimLine({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]), [from, to]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineSegments geometry={geo} renderOrder={999}>
      <lineBasicMaterial color="#FF2E9A" depthTest={false} />
    </lineSegments>
  );
}

/** The gap to the neighbour, typed — up to 500 mm, the user's limit. Sits
 *  over the partition, in the scene, instead of a panel. */
export function GapField({ position, gapMm, onCommit }: {
  position: [number, number, number];
  gapMm: number;
  onCommit: (mm: number) => void;
}) {
  const [draft, setDraft] = useState(String(gapMm));
  useEffect(() => { setDraft(String(gapMm)); }, [gapMm]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(v)) { setDraft(String(gapMm)); return; }
    onCommit(Math.max(0, Math.min(500, Math.round(v))));
  };
  return (
    <Html position={position} center zIndexRange={[95, 0]}>
      <label
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999,
          background: 'rgba(255,255,255,0.96)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontSize: 12, fontWeight: 600, color: '#1E3A8A', whiteSpace: 'nowrap', pointerEvents: 'auto',
        }}
      >
        Oraliq
        <input
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ width: 52, border: '1px solid #CBD5E1', borderRadius: 8, padding: '2px 6px', fontSize: 13, textAlign: 'right' }}
        />
        mm
      </label>
    </Html>
  );
}

/** The selected room's wall handles — drag one to move that wall. */
export function ResizeHandles({ target }: { target: MoveTarget }) {
  return (
    <>
      {handlePoints(target).map((h) => (
        <group key={h.side} position={[h.x, 0.07, h.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
          <mesh>
            <circleGeometry args={[0.17, 24]} />
            <meshBasicMaterial color="#2E5BFF" depthTest={false} transparent opacity={0.95} />
          </mesh>
          <mesh position={[0, 0, 0.001]}>
            <circleGeometry args={[0.11, 24]} />
            <meshBasicMaterial color="#FFFFFF" depthTest={false} transparent opacity={0.98} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * The room's new size while a wall is dragged: its floor outlined, the moving
 * wall drawn where it is going, and the dimensions as they change — the room
 * along the changing direction, and its width × depth. The real walls take
 * the size when the finger lifts.
 */
export function ResizeGhost({ box, side, height, note }: {
  box: MoveTarget; side: WallSide; height: number;
  /** Why the wall stopped short, said where it stopped. */
  note?: string;
}) {
  const alongX = side === 'B' || side === 'D';
  const edge = side === 'B' ? box.cx + box.w / 2 : side === 'D' ? box.cx - box.w / 2 : side === 'C' ? box.cz + box.d / 2 : box.cz - box.d / 2;
  const wallPos: [number, number, number] = alongX ? [edge, height / 2, box.cz] : [box.cx, height / 2, edge];
  const wallLen = alongX ? box.d : box.w;
  const size = alongX ? box.w : box.d;
  const from: [number, number, number] = alongX ? [box.cx - box.w / 2, 0.1, box.cz] : [box.cx, 0.1, box.cz - box.d / 2];
  const to: [number, number, number] = alongX ? [box.cx + box.w / 2, 0.1, box.cz] : [box.cx, 0.1, box.cz + box.d / 2];
  return (
    <group renderOrder={998}>
      <mesh position={[box.cx, 0.03, box.cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[box.w, box.d]} />
        <meshBasicMaterial color="#2E5BFF" transparent opacity={0.16} depthTest={false} />
      </mesh>
      <mesh position={wallPos} rotation={[0, alongX ? Math.PI / 2 : 0, 0]}>
        <planeGeometry args={[wallLen, height]} />
        <meshBasicMaterial color="#2E5BFF" transparent opacity={0.3} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      <DimLine from={from} to={to} />
      {note && (
        <Html position={[wallPos[0], height + 0.15, wallPos[2]]} center zIndexRange={[61, 0]} style={{ pointerEvents: 'none' }}>
          <span style={{ padding: '3px 9px', borderRadius: 999, background: '#F59E0B', color: '#111827', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
            {note}
          </span>
        </Html>
      )}
      <Html position={[(from[0] + to[0]) / 2, 0.1, (from[2] + to[2]) / 2]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
        <span style={{ padding: '3px 9px', borderRadius: 999, background: '#FF2E9A', color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
          {size.toFixed(2)} m
        </span>
      </Html>
      <Html position={[box.cx, height + 0.2, box.cz]} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
        <span style={{ padding: '3px 9px', borderRadius: 999, background: 'rgba(17,24,39,0.85)', color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {box.w.toFixed(2)} × {box.d.toFixed(2)} m
        </span>
      </Html>
    </group>
  );
}

/** A neighbour's new outline where the room being resized cuts into it —
 *  shown while dragging, before the confirm. */
export function CutOutline({ outline, height = 0.08 }: { outline: [number, number][]; height?: number }) {
  // A THREE.Line mounted as a primitive: the JSX <line> is SVG's.
  const line = useMemo(() => {
    const pts = outline.map(([x, z]) => new THREE.Vector3(x, height, z));
    pts.push(pts[0].clone());
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#F59E0B', depthTest: false }),
    );
    l.renderOrder = 999;
    return l;
  }, [outline, height]);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  return <primitive object={line} />;
}

/** The button beside the lock. */
export function MoveRoomsButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? "Xonalarni siljitishni tugatish" : "Xonalarni siljitish"}
      aria-label={active ? "Xonalarni siljitishni tugatish" : "Xonalarni siljitish"}
      aria-pressed={active}
      className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ring-1 transition-colors ${
        active ? 'bg-brand text-white ring-brand/40' : 'bg-white/95 text-brand ring-black/5'
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
      </svg>
    </button>
  );
}
