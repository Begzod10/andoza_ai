import { useEffect, useRef, useState } from "react";
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
  return { x: Math.max(0.6, t.w / 2 - 0.2), z: Math.max(0.6, t.d / 2 - 0.2) };
}

/**
 * The input side of move mode. Listened for on the canvas's wrapper in the
 * CAPTURE phase, so a press on an arrow is taken before the orbit controls
 * see it — and only that press: anything else falls through to them, so the
 * view still turns. A short tap (no drag) selects the room under it, or
 * clears the selection on empty floor. The scene's own pointer events are off
 * meanwhile, so no wall ring or door panel answers.
 */
export function RoomMoveInput({ rooms, selected, onSelect, onDrag, onDragEnd }: {
  rooms: readonly MoveTarget[];
  /** The selected room as it stands now (live). */
  selected: MoveTarget | null;
  onSelect: (id: string | null) => void;
  onDrag: (axis: 'x' | 'z', delta: number) => void;
  onDragEnd: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const set = useThree((s) => s.set);
  const latest = useRef({ rooms, selected, onSelect, onDrag, onDragEnd });
  latest.current = { rooms, selected, onSelect, onDrag, onDragEnd };

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
    let drag: { pointer: number; axis: 'x' | 'z'; start: THREE.Vector3 } | null = null;
    let tap: { pointer: number; x: number; y: number } | null = null;

    const down = (e: PointerEvent) => {
      if (drag || e.target !== gl.domElement) return;
      const p = ground(e);
      const sel = latest.current.selected;
      if (p && sel) {
        const dx = p.x - sel.cx, dz = p.z - sel.cz;
        const reach = arrowReach(sel);
        const onX = Math.abs(dz) < GRAB_M && Math.abs(dx) <= reach.x + 0.3;
        const onZ = Math.abs(dx) < GRAB_M && Math.abs(dz) <= reach.z + 0.3;
        const axis = onX && (!onZ || Math.abs(dx) >= Math.abs(dz)) ? 'x' : onZ ? 'z' : null;
        if (axis) {
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
        if (p) latest.current.onDrag(drag.axis, drag.axis === 'x' ? p.x - drag.start.x : p.z - drag.start.z);
      } else if (tap && e.pointerId === tap.pointer && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) {
        tap = null; // it was the view being turned
      }
    };
    const up = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.pointer) {
        drag = null;
        latest.current.onDragEnd();
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

/** The selected room's arrows: red along X, blue along Z, crossing at its
 *  centre, a little above the floor and drawn over everything. */
export function RoomMoveArrows({ target }: { target: MoveTarget }) {
  const reach = arrowReach(target);
  return (
    <group position={[target.cx, 0.06, target.cz]} renderOrder={999}>
      <FloorArrow axis="x" reach={reach.x} color="#E5484D" />
      <FloorArrow axis="z" reach={reach.z} color="#2E5BFF" />
    </group>
  );
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

/** The panel for the selected room — at the top of the view, clear of the
 *  room and its arrows, which sit low on a phone's screen: where it stands against its nearest
 *  neighbour, the ways to put it exactly somewhere, undo and done. */
export function RoomMovePanel({
  gapMm, startMm, endMm, alongWall, onGapMm, onStartMm, onSnap, canUndo, onUndo, onDone,
}: {
  gapMm: number | null;
  startMm: number | null;
  endMm: number | null;
  /** Whether it stands along a neighbour's wall (the snaps and offset apply). */
  alongWall: boolean;
  onGapMm: (mm: number) => void;
  onStartMm: (mm: number) => void;
  onSnap: (where: 'start' | 'centre' | 'end') => void;
  canUndo: boolean;
  onUndo: () => void;
  onDone: () => void;
}) {
  const chip = "px-3 py-2 min-h-[40px] rounded-full text-xs font-semibold bg-card-soft text-ink border border-line";
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 top-3 z-30 w-[min(92vw,360px)] rounded-2xl bg-card/95 shadow-xl ring-1 ring-black/10 p-3 text-sm text-ink"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="font-semibold mb-1">Xonani siljitish</p>
      <p className="text-xs text-ink-muted mb-2">
        Qizil va ko'k strelkalarni suring.
        {gapMm !== null && <> Qo'shnigacha: {gapMm} mm.</>}
        {alongWall && startMm !== null && endMm !== null && <> Boshi: {(startMm / 1000).toFixed(2)} m · Oxiri: {(endMm / 1000).toFixed(2)} m</>}
      </p>
      {alongWall && (
        <div className="flex gap-1.5 mb-2">
          <button className={chip} onClick={() => onSnap('start')}>Boshiga</button>
          <button className={chip} onClick={() => onSnap('centre')}>O'rtaga</button>
          <button className={chip} onClick={() => onSnap('end')}>Oxiriga</button>
        </div>
      )}
      <div className="flex gap-2 mb-3">
        <MmField label="Oraliq (mm)" value={gapMm} onCommit={onGapMm} />
        {alongWall && <MmField label="Boshidan (mm)" value={startMm} onCommit={onStartMm} />}
      </div>
      <div className="flex gap-2">
        <button className="flex-1 min-h-[44px] rounded-full border border-line text-ink font-semibold disabled:opacity-40" disabled={!canUndo} onClick={onUndo}>Bekor</button>
        <button className="flex-1 min-h-[44px] rounded-full bg-brand text-white font-semibold" onClick={onDone}>Tayyor</button>
      </div>
    </div>
  );
}

function MmField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (mm: number) => void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => { setDraft(value === null ? '' : String(value)); }, [value]);
  const commit = () => { const v = Number(draft); if (draft.trim() !== '' && Number.isFinite(v)) onCommit(v); };
  return (
    <label className="flex-1 min-w-0 flex flex-col gap-1 text-xs text-ink-muted">
      {label}
      <input
        inputMode="numeric"
        value={draft}
        disabled={value === null}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        className="w-full min-w-0 min-h-[40px] rounded-xl border border-line bg-card-soft px-3 text-sm text-ink"
      />
    </label>
  );
}
