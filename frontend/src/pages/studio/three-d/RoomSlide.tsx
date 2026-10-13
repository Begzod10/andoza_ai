import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useViewLockStore } from "@/store/viewLockStore";

/**
 * The studio half of sliding a room along its neighbour's wall (lib/slideRoom
 * has the geometry). A button beside a room's focus button starts it; while
 * it is on, a one-finger drag anywhere in the view moves that room along the
 * shared wall, and a small panel gives the two end distances, flush and
 * centred snaps, an exact figure and cancel / done.
 */

/** Beside the focus button: starts (or, pressed again, ends) sliding. */
export function MoveRoomButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={active ? "Siljitishni tugatish" : "Xonani devor bo'ylab siljitish"}
      aria-label={active ? "Siljitishni tugatish" : "Xonani devor bo'ylab siljitish"}
      aria-pressed={active}
      style={{
        width: 26, height: 26, borderRadius: 8, border: 'none', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', pointerEvents: 'auto',
        background: active ? '#1E40AF' : 'rgba(255,255,255,0.95)',
        color: active ? '#fff' : '#1E40AF',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
      </svg>
    </button>
  );
}

/**
 * While sliding: a one-finger drag reports where it is on the floor plane.
 *
 * Listened for on the canvas's wrapper in the CAPTURE phase, so the press is
 * taken before the orbit controls (which listen on the canvas itself) can
 * start turning the view with it; and the scene's own pointer events are off
 * meanwhile, so no wall ring or door panel answers the same press.
 */
export function RoomSlideDrag({ onDrag, onDragEnd }: {
  onDrag: (from: THREE.Vector3, to: THREE.Vector3) => void;
  onDragEnd: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const set = useThree((s) => s.set);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  useEffect(() => {
    set((st) => ({ events: { ...st.events, enabled: false } }));
    const host = gl.domElement.parentElement;
    if (!host) return;
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ground = (e: PointerEvent): THREE.Vector3 | null => {
      const r = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      return ray.ray.intersectPlane(floor, p) ? p : null;
    };
    let start: THREE.Vector3 | null = null;
    let pointer: number | null = null;
    const down = (e: PointerEvent) => {
      // Only presses on the scene itself — the room's buttons float over it
      // in the same wrapper and must keep working.
      if (pointer !== null || e.target !== gl.domElement) return;
      const p = ground(e);
      if (!p) return;
      e.stopPropagation();
      start = p; pointer = e.pointerId;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer || !start) return;
      e.stopPropagation();
      const p = ground(e);
      if (p) onDragRef.current(start, p);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer || !start) return;
      const p = ground(e);
      if (p) onDragRef.current(start, p);
      onDragEndRef.current();
      start = null; pointer = null;
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

/** The panel: where the room stands against its neighbour, and the ways to
 *  put it exactly somewhere. */
export function RoomSlidePanel({
  startMm, endMm, onSnap, onStartMm, onCancel, onDone,
}: {
  startMm: number;
  endMm: number;
  onSnap: (where: 'start' | 'centre' | 'end') => void;
  onStartMm: (mm: number) => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(String(startMm));
  useEffect(() => { setDraft(String(startMm)); }, [startMm]);
  const commit = () => { const v = Number(draft); if (Number.isFinite(v)) onStartMm(v); };
  const chip = "px-3 py-2 min-h-[40px] rounded-full text-xs font-semibold bg-card-soft text-ink border border-line";
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-24 z-30 w-[min(92vw,360px)] rounded-2xl bg-card/95 shadow-xl ring-1 ring-black/10 p-3 text-sm text-ink"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <p className="font-semibold mb-1">Xonani devor bo'ylab siljitish</p>
      <p className="text-xs text-ink-muted mb-2">
        Barmoq bilan suring. Boshi: {(startMm / 1000).toFixed(2)} m · Oxiri: {(endMm / 1000).toFixed(2)} m
      </p>
      <div className="flex gap-1.5 mb-2">
        <button className={chip} onClick={() => onSnap('start')}>Boshiga</button>
        <button className={chip} onClick={() => onSnap('centre')}>O'rtaga</button>
        <button className={chip} onClick={() => onSnap('end')}>Oxiriga</button>
      </div>
      <label className="flex items-center gap-2 mb-3 text-xs text-ink-muted">
        Boshidan (mm)
        <input
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className="flex-1 min-h-[40px] rounded-xl border border-line bg-card-soft px-3 text-sm text-ink"
        />
      </label>
      <div className="flex gap-2">
        <button className="flex-1 min-h-[44px] rounded-full border border-line text-ink font-semibold" onClick={onCancel}>Bekor</button>
        <button className="flex-1 min-h-[44px] rounded-full bg-brand text-white font-semibold" onClick={onDone}>Tayyor</button>
      </div>
    </div>
  );
}

/** Hands the scene's camera to code outside the canvas that has to move it
 *  (ending a slide of the open room). */
export function CameraRefBridge({ cameraRef }: { cameraRef: { current: THREE.Camera | null } }) {
  const camera = useThree((s) => s.camera);
  cameraRef.current = camera;
  return null;
}
