import { useEffect, useMemo, useRef, useState } from "react";
import {
  isometricRoom, clampRoomDimension,
  NEW_ROOM_DEFAULT_MM, NEW_ROOM_LIMITS_MM,
  type RoomSide, type RoomDimensionKey,
} from "@/lib/newRoomFromWall";

/**
 * The little window that opens when you ask for a room through a wall.
 *
 * It shows the room before it exists. The dimensions are three numbers, and
 * three numbers are not a shape — so the drawing is the point of this sheet,
 * not decoration beside it: it is in proportion and redraws as you type, which
 * is the difference between "3.5 by 6" and seeing that you have just asked for
 * a corridor. `lib/newRoomFromWall.ts` does the projection.
 *
 * Deliberately small. Everything else about a room — its name, its finishes,
 * its doors — is better decided once it exists and you can see it, and the
 * wizard is still there for anyone who wants to go the long way round.
 */

/** Which wall the room is going through, in the user's language. */
const SIDE_LABEL: Record<RoomSide, string> = {
  north: 'shimol', south: 'janub', east: 'sharq', west: 'g‘arb',
};

const FIELDS: { key: RoomDimensionKey; label: string }[] = [
  { key: 'width', label: 'Eni' },
  { key: 'depth', label: "Bo‘yi" },
  { key: 'height', label: 'Balandligi' },
  // Last, and set apart below: the first three describe the room, this one
  // describes the wall between it and the room it is being added to.
  { key: 'wallThickness', label: 'Devor qalinligi' },
];

/** Keeps Tab cycling inside the sheet instead of leaking to the page behind
 *  it. Duplicated locally, the same convention NewWindowSheet and
 *  RoomSettingsSheet follow. */
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

export interface NewRoomValues {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  /** The shared wall between this room and the one it is added to — which is
   *  also exactly how far apart the two are placed. */
  wallThicknessMm: number;
}

export function NewRoomSheet({ isOpen, side, defaultHeightMm, busy, onClose, onConfirm }: {
  isOpen: boolean;
  /** The side the tapped wall faces — null while the sheet is closed. */
  side: RoomSide | null;
  /** This room's ceiling height, so the new room starts level with it rather
   *  than at a catalogue default the rest of the flat does not share. */
  defaultHeightMm?: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (values: NewRoomValues) => void;
}) {
  const [dims, setDims] = useState<NewRoomValues>({
    widthMm: NEW_ROOM_DEFAULT_MM.width,
    depthMm: NEW_ROOM_DEFAULT_MM.depth,
    heightMm: defaultHeightMm ?? NEW_ROOM_DEFAULT_MM.height,
    wallThicknessMm: NEW_ROOM_DEFAULT_MM.wallThickness,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  // Fresh defaults each time it opens: the sheet is a one-shot decision, and
  // last time's numbers are not a better starting point than the flat's own.
  useEffect(() => {
    if (!isOpen) return;
    setDims({
      widthMm: NEW_ROOM_DEFAULT_MM.width,
      depthMm: NEW_ROOM_DEFAULT_MM.depth,
      heightMm: clampRoomDimension(defaultHeightMm ?? NEW_ROOM_DEFAULT_MM.height, 'height'),
      wallThicknessMm: NEW_ROOM_DEFAULT_MM.wallThickness,
    });
  }, [isOpen, defaultHeightMm]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (panelRef.current) trapTabKey(e, panelRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const FIELD_OF: Record<RoomDimensionKey, keyof NewRoomValues> = {
    width: 'widthMm', depth: 'depthMm', height: 'heightMm', wallThickness: 'wallThicknessMm',
  };
  const value = (key: RoomDimensionKey) => dims[FIELD_OF[key]];
  const setValue = (key: RoomDimensionKey, mm: number) =>
    setDims((d) => ({ ...d, [FIELD_OF[key]]: clampRoomDimension(mm, key) }));

  const iso = useMemo(
    () => isometricRoom(dims.widthMm, dims.depthMm, dims.heightMm),
    [dims.widthMm, dims.depthMm, dims.heightMm],
  );

  if (!isOpen || !side) return null;

  const areaM2 = (dims.widthMm / 1000) * (dims.depthMm / 1000);

  return (
    <div
      className="fixed inset-0 z-[340] flex items-center justify-center bg-black/40 px-4"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Yangi xona"
        className="w-full max-w-[340px] rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2">
          <p className="text-[15px] font-bold text-gray-900">Yangi xona</p>
          <p className="text-[11px] text-muted">
            Shu devor orqasida ({SIDE_LABEL[side]} tomon)
          </p>
        </div>

        {/* The room, in proportion. Redraws on every keystroke — that is what
            makes the numbers mean something before the room exists. */}
        <div className="px-4">
          <div className="rounded-xl bg-[#F6F7F9] py-2">
            <svg viewBox={iso.viewBox} className="w-full h-[150px]" aria-hidden="true">
              <polygon points={iso.left} fill="#C9D2E3" />
              <polygon points={iso.right} fill="#AEB9CE" />
              <polygon points={iso.top} fill="#E7ECF4" />
              <g fill="none" stroke="#1E40AF" strokeWidth="1.25" strokeLinejoin="round">
                <polygon points={iso.top} />
                <polygon points={iso.left} />
                <polygon points={iso.right} />
              </g>
            </svg>
            <p className="text-center text-[11px] font-semibold text-gray-500">
              {areaM2.toFixed(1)} m²
            </p>
          </div>
        </div>

        <div className="px-4 pb-1">
          {FIELDS.map(({ key, label }) => {
            const { min, max } = NEW_ROOM_LIMITS_MM[key];
            // A wall moves in centimetres; a room in tenths of a metre.
            const step = key === 'wallThickness' ? 10 : 100;
            return (
              <div key={key} className="flex items-center justify-between py-2.5 border-b border-[#EDEEF1] last:border-0">
                <p className="text-[14px] font-semibold text-gray-800">{label}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setValue(key, value(key) - step)}
                    aria-label={`${label} kamaytirish`}
                    disabled={value(key) <= min}
                    className="w-9 h-9 rounded-full bg-[#EDEEF1] text-gray-700 text-lg font-bold flex items-center justify-center disabled:opacity-40"
                  >
                    −
                  </button>
                  {/* Typable as well as steppable: stepping from 3.5 to 8 m is
                      45 taps, and this is the one screen where the exact
                      number is the whole decision. */}
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`${label}, mm`}
                    value={value(key)}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => setValue(key, Number(e.target.value))}
                    className="w-[72px] h-9 rounded-lg bg-[#F6F7F9] text-center text-[14px] font-bold text-gray-900 ring-1 ring-black/5"
                  />
                  <button
                    onClick={() => setValue(key, value(key) + step)}
                    aria-label={`${label} oshirish`}
                    disabled={value(key) >= max}
                    className="w-9 h-9 rounded-full bg-[#EDEEF1] text-gray-700 text-lg font-bold flex items-center justify-center disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 p-4 pt-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-[#EDEEF1] text-[14px] font-bold text-gray-700"
          >
            Bekor qilish
          </button>
          <button
            onClick={() => onConfirm(dims)}
            disabled={busy}
            className="flex-1 h-11 rounded-xl bg-brand text-[14px] font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Yaratilmoqda…' : 'Yaratish'}
          </button>
        </div>
      </div>
    </div>
  );
}
