import { useEffect, useMemo, useRef, useState } from "react";
import { useRoomStore, computeFloorArea, computePerimeter } from "@/store/roomStore";
import type { RoomGeometry, WallElement } from "@/store/roomStore";
import { WINDOW_STYLES, resolveWindowStyle } from "@/lib/windowStyles";
import { WindowElevation } from "@/features/studio/WindowElevation";
import NewWindowSheet from "./NewWindowSheet";
import { hasAbcdWalls } from "@/lib/roomDims";

// Keeps Tab cycling inside the sheet instead of leaking out to the page
// behind the backdrop while it's open.
function trapTabKey(e: KeyboardEvent, container: HTMLElement) {
  if (e.key !== 'Tab') return;
  const focusables = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const WALL_LABELS: Record<string, string> = {
  A: "Devor A (uzunlik)",
  B: "Devor B (kenglik)",
  C: "Devor C (uzunlik)",
  D: "Devor D (kenglik)",
};

// position: 0 is a placeholder here, not a real placement — positionAuto:
// true tells resolveElementPositions (wallPositions.ts) to auto-center/
// auto-spread it until the user first drags or keyboard-nudges it, at which
// point WallOpenings.tsx marks it positionAuto: false permanently.
const DEFAULT_WINDOW = { type: "deraza" as const, width: 900, height: 1200, sill_height: 800, position: 0, positionAuto: true };
const DEFAULT_DOOR   = { type: "eshik"  as const, width: 900, height: 2100, sill_height: 0,   position: 0, positionAuto: true };

function MiniStepper({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        aria-label={`${label} kamaytirish`}
        className="w-11 h-11 rounded-full bg-[#EDEEF1] text-gray-600 text-base font-bold flex items-center justify-center leading-none"
      >
        −
      </button>
      <span className="text-[12px] font-bold text-gray-800 w-12 text-center">
        {(value / 1000).toFixed(2)} m
      </span>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        aria-label={`${label} oshirish`}
        className="w-11 h-11 rounded-full bg-[#EDEEF1] text-gray-600 text-base font-bold flex items-center justify-center leading-none"
      >
        +
      </button>
    </div>
  );
}

function DimStepper({
  label,
  sub,
  value,
  onChange,
  min,
  max,
  step,
  decimals = 1,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** A measured polygon wall is 5.78 m, not "5.8 m" — show it at the
   *  precision it was measured at. Wizard rectangles keep one decimal. */
  decimals?: number;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#EDEEF1] last:border-0">
      <div>
        <p className="text-[14px] font-semibold text-gray-800">{label}</p>
        {sub && <p className="text-[11px] text-muted">{sub}</p>}
      </div>
      <div className="flex items-center gap-2.5">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          aria-label={`${label} kamaytirish`}
          className="w-11 h-11 rounded-full bg-[#EDEEF1] text-gray-700 text-lg font-bold flex items-center justify-center"
        >
          −
        </button>
        <span className="text-[15px] font-bold text-gray-900 w-16 text-center tabular-nums">
          {(value / 1000).toFixed(decimals)} m
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          aria-label={`${label} oshirish`}
          className="w-11 h-11 rounded-full bg-[#EDEEF1] text-gray-700 text-lg font-bold flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Read-only "Xona o'lchovlari" strip — the numbers that describe the whole
 * room rather than one wall.
 *
 * A LiDAR-scanned room arrives carrying real measurements (the API's `RoomOut`
 * has `floor_area`, `perimeter` and `openings_count`) and the studio never
 * showed any of them: the header's one-line summary from 745d90e3 is the only
 * place a floor area appears, and the sheet below is all per-wall steppers. So
 * a user who scanned a 37.5 m² five-wall room could read five wall lengths but
 * never the area, the perimeter or how many openings were detected.
 *
 * Derived from the live store rather than copied off `RoomOut`, deliberately.
 * They are the same quantities — the backend computes them from the very same
 * geometry — but the API's copy is a snapshot from load time, and the steppers
 * directly below this strip rewrite the geometry (`resizeWall` restretches the
 * outline and recomputes every wall length). Reading `room.floor_area` would
 * leave a stale 37.5 m² sitting above a list the user just edited to a
 * different shape. `computeFloorArea` (shoelace over `geometry.vertices`, with
 * the A×B rectangle fallback) and `computePerimeter` are the existing pure
 * helpers for exactly this, already used by StudioPage's header and the smeta,
 * so nothing is recomputed here that the app did not already know how to
 * compute.
 *
 * Shape-agnostic on purpose: every figure is a whole-room total, so a
 * rectangle and an N-wall polygon both render sensibly, and none of the three
 * repeats what the steppers above already show (Uzunlik / Kenglik / per-wall
 * length / Shift balandligi). Strictly a summary — no controls live in here.
 */
function RoomSummary({ geometry }: { geometry: RoomGeometry }) {
  const stats = useMemo(() => {
    const areaM2 = computeFloorArea(geometry) / 1e6;
    const perimeterM = computePerimeter(geometry) / 1000;
    // Every entry in `wall.elements` IS an opening (deraza / eshik / balkon) —
    // the same rows the DERAZALAR VA ESHIKLAR section below lists per wall,
    // which is the total that section never shows.
    const openings = geometry.walls.reduce((n, w) => n + w.elements.length, 0);
    return [
      { label: "Maydon",     value: `${areaM2.toFixed(1)} m²` },
      { label: "Perimetr",   value: `${perimeterM.toFixed(1)} m` },
      { label: "Ochiqliklar", value: `${openings} ta` },
    ];
  }, [geometry]);

  return (
    <div
      className="grid grid-cols-3 gap-2 mb-4"
      role="group"
      aria-label="Xona o'lchovlari"
    >
      {stats.map((s) => (
        <div key={s.label} className="bg-[#F9FAFB] rounded-2xl px-3 py-2.5 text-center">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-wide">
            {s.label}
          </p>
          <p className="text-[15px] font-bold text-gray-900 tabular-nums mt-0.5">
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ElementRow({
  wallId,
  el,
}: {
  wallId: string;
  el: WallElement;
}) {
  const updateElement = useRoomStore((s) => s.updateElement);
  const removeElement = useRoomStore((s) => s.removeElement);
  const isWindow = el.type === "deraza";

  return (
    <div className="py-3 border-b border-[#EDEEF1] last:border-0">
      {/* Top row: icon + name + delete */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[18px]">{isWindow ? "🪟" : "🚪"}</span>
          <p className="text-[13px] font-semibold text-gray-800">
            {isWindow ? "Deraza" : "Eshik"}
          </p>
        </div>
        <button
          onClick={() => removeElement(wallId, el.id)}
          className="text-[12px] font-semibold text-red-500 px-3 py-1 rounded-xl bg-red-50"
        >
          O'chirish
        </button>
      </div>

      {/* Dimension steppers */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Kenglik</span>
          <MiniStepper
            label="Kenglik"
            value={el.width}
            onChange={(v) => updateElement(wallId, el.id, { width: v })}
            min={400} max={3000} step={100}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Balandlik</span>
          <MiniStepper
            label="Balandlik"
            value={el.height}
            onChange={(v) => updateElement(wallId, el.id, { height: v })}
            min={400} max={3000} step={100}
          />
        </div>
        {isWindow && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Poldan</span>
            <MiniStepper
              label="Poldan balandlik"
              value={el.sill_height}
              onChange={(v) => updateElement(wallId, el.id, { sill_height: v })}
              min={0} max={2000} step={100}
            />
          </div>
        )}
      </div>

      {/* Window type — the shapes this opening can take, scroll and tap */}
      {isWindow && (
        <div className="mt-2.5">
          <span className="text-[10px] text-muted font-semibold uppercase tracking-wide">Turi</span>
          <div className="mt-1 flex gap-1.5 overflow-x-auto pb-1">
            {WINDOW_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => updateElement(wallId, el.id, { styleId: s.id })}
                title={s.label}
                className={`shrink-0 w-11 h-12 p-1 rounded-lg border-2 transition-colors ${
                  resolveWindowStyle(el).id === s.id
                    ? 'border-blue-700 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <WindowElevation style={s} strokeWidth={0.9} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoomSettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const geometry     = useRoomStore((s) => s.geometry);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);
  const setWallLength = useRoomStore((s) => s.setWallLength);
  const setCeilingH   = useRoomStore((s) => s.setCeilingHeight);
  const addElement    = useRoomStore((s) => s.addElement);

  // Which wall's "+ Deraza" is pending a style/size choice — null when no
  // chooser is open. Set on button click; the window is only actually
  // added to the store once the user confirms in NewWindowSheet.
  const [pendingWindowWallId, setPendingWindowWallId] = useState<string | null>(null);

  // Only a wizard rectangle has the A/B/C/D wall pairs the two paired
  // steppers below edit. A LiDAR-scanned or hand-drawn room is an N-wall
  // polygon with numbered ids ("0".."4"), where those lookups missed: the
  // sheet showed the hardcoded 4.0 / 3.0 fallbacks as if they were measured,
  // and every +/- wrote to walls "A"/"C"/"B"/"D" that do not exist, so the
  // buttons did nothing at all. Same root cause as the header fix in
  // 745d90e3, and detected the same way. Such rooms get a per-wall list
  // instead (below), labelled exactly like the openings section.
  const isRect = hasAbcdWalls(geometry);
  const wallA = geometry.walls.find((w) => w.id === "A")?.length ?? 4000;
  const wallB = geometry.walls.find((w) => w.id === "B")?.length ?? 3000;

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Focus management: unlike AddObjectSheet, this component stays mounted
  // across opens/closes (`open` just toggles rendering below), so capture
  // and restore have to key off the `open` prop rather than mount/unmount.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (panelRef.current) trapTabKey(e, panelRef.current);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setLength(axis: "AC" | "BD", val: number) {
    if (axis === "AC") { setWallLength("A", val); setWallLength("C", val); }
    else               { setWallLength("B", val); setWallLength("D", val); }
  }

  if (!open) return null;

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: "rgba(0,0,0,.35)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-settings-title"
        className="w-full bg-white rounded-t-[24px] shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pb-10">
          {/* header */}
          <div className="flex items-center justify-between py-3 mb-1">
            <h2 id="room-settings-title" className="text-[18px] font-extrabold text-gray-900">Xona sozlamalari</h2>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Yopish"
              className="w-11 h-11 rounded-full bg-[#F3F4F6] flex items-center justify-center text-gray-500 text-[13px] font-bold"
            >
              ✕
            </button>
          </div>

          {/* ── Read-only room summary ───────────────────────── */}
          <RoomSummary geometry={geometry} />

          {/* ── Room dimensions ──────────────────────────────── */}
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2">
            O'lchamlar
          </p>
          <div className="bg-[#F9FAFB] rounded-2xl px-4 mb-5">
            {isRect ? (
              <>
                <DimStepper
                  label="Uzunlik" sub="A – C devorlar"
                  value={wallA} onChange={(v) => setLength("AC", v)}
                  min={1000} max={15000} step={100}
                />
                <DimStepper
                  label="Kenglik" sub="B – D devorlar"
                  value={wallB} onChange={(v) => setLength("BD", v)}
                  min={1000} max={15000} step={100}
                />
              </>
            ) : (
              geometry.walls.map((wall) => (
                <DimStepper
                  key={wall.id}
                  label={WALL_LABELS[wall.id] ?? `Devor ${wall.id}`}
                  value={wall.length}
                  onChange={(v) => setWallLength(wall.id, v)}
                  min={1000} max={15000} step={100}
                  decimals={2}
                />
              ))
            )}
            <DimStepper
              label="Shift balandligi"
              value={ceilingHeight} onChange={setCeilingH}
              min={2000} max={4500} step={100}
            />
          </div>

          {/* ── Windows & Doors ──────────────────────────────── */}
          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-3">
            Derazalar va Eshiklar
          </p>
          <div className="space-y-3">
            {geometry.walls.map((wall) => (
              <div key={wall.id} className="bg-[#F9FAFB] rounded-2xl px-4 py-3">
                <p className="text-[13px] font-bold text-gray-600 mb-1">
                  {WALL_LABELS[wall.id] ?? `Devor ${wall.id}`}
                </p>

                {wall.elements.length === 0 && (
                  <p className="text-[12px] text-muted mb-2">Element yo'q</p>
                )}

                {wall.elements.map((el) => (
                  <ElementRow key={el.id} wallId={wall.id} el={el} />
                ))}

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setPendingWindowWallId(wall.id)}
                    className="flex-1 py-2 rounded-xl text-[13px] font-bold text-brand bg-brand-tint"
                  >
                    + Deraza
                  </button>
                  <button
                    onClick={() => addElement(wall.id, DEFAULT_DOOR)}
                    className="flex-1 py-2 rounded-xl text-[13px] font-bold text-gray-700 bg-[#EDEEF1]"
                  >
                    + Eshik
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    <NewWindowSheet
      isOpen={pendingWindowWallId !== null}
      onClose={() => setPendingWindowWallId(null)}
      onConfirm={(values) => {
        if (pendingWindowWallId) {
          addElement(pendingWindowWallId, { ...DEFAULT_WINDOW, ...values });
        }
        setPendingWindowWallId(null);
      }}
    />
    </>
  );
}
