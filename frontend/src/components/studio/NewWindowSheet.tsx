import { useEffect, useRef, useState } from "react";
import { WindowStylePicker } from "@/features/studio/WindowStylePicker";
import { DEFAULT_WINDOW_STYLE } from "@/lib/windowStyles";

// Matches the DEFAULT_WINDOW values in RoomSettingsSheet.tsx — this sheet's
// starting point before the user adjusts anything.
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 1200;
const DEFAULT_SILL_HEIGHT = 800;

// Same frame-color options and default as WindowEditor's "Rom rangi" swatches
// in DoorLeaves.tsx (SASH_COLORS) — duplicated locally per this file's own
// convention rather than shared, so a color picked here and one picked from
// the post-placement editor offer the identical set.
const FRAME_COLORS = ["#E8E2D8", "#FFFFFF", "#8B5E34", "#5A5A5A", "#2F4858"];
const DEFAULT_FRAME_COLOR = FRAME_COLORS[0];

// Keeps Tab cycling inside the sheet instead of leaking out to the page
// behind the backdrop while it's open. Duplicated locally rather than
// shared — same convention as RoomSettingsSheet.tsx / AddObjectSheet.tsx.
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

// Same look/behavior as RoomSettingsSheet's DimStepper (used there for room
// dimensions), duplicated locally per this file's convention rather than
// shared, so the width/height/sill inputs here feel identical.
function DimStepper({
  label,
  sub,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  sub?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
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
        <span className="text-[15px] font-bold text-gray-900 w-14 text-center">
          {(value / 1000).toFixed(1)} m
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

export interface NewWindowValues {
  width: number;
  height: number;
  sill_height: number;
  styleId: string;
  leafColor: string;
}

interface NewWindowSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (values: NewWindowValues) => void;
  /** Overrides the "Poldan balandlik" stepper's starting value — used by the
   *  wall-tap flow (ThreeDPage's radial menu) to pre-fill it with the height
   *  actually tapped, instead of always starting at DEFAULT_SILL_HEIGHT.
   *  Whatever the stepper reads when confirmed (this default, left alone, or
   *  the user's own adjustment) is what gets used — never silently
   *  recomputed out from under a value the user set deliberately. */
  initialSillHeight?: number;
}

/**
 * Asks which window type (style/size) to place, before it's added to the
 * wall — a pure "gather choices, call a callback" component. The caller
 * (RoomSettingsSheet) owns the actual `addElement` store call.
 */
export default function NewWindowSheet({ isOpen, onClose, onConfirm, initialSillHeight }: NewWindowSheetProps) {
  const [styleId, setStyleId] = useState(DEFAULT_WINDOW_STYLE);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [sillHeight, setSillHeight] = useState(DEFAULT_SILL_HEIGHT);
  const [leafColor, setLeafColor] = useState(DEFAULT_FRAME_COLOR);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Like RoomSettingsSheet, this component stays mounted across opens/closes
  // (`isOpen` just toggles rendering below), so choices are reset and focus
  // capture/restore keys off the `isOpen` prop rather than mount/unmount.
  useEffect(() => {
    if (!isOpen) return;
    setStyleId(DEFAULT_WINDOW_STYLE);
    setWidth(DEFAULT_WIDTH);
    setHeight(DEFAULT_HEIGHT);
    setSillHeight(initialSillHeight ?? DEFAULT_SILL_HEIGHT);
    setLeafColor(DEFAULT_FRAME_COLOR);

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
  }, [isOpen]);

  if (!isOpen) return null;

  function handleConfirm() {
    onConfirm({ width, height, sill_height: sillHeight, styleId, leafColor });
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-[rgba(17,24,39,.45)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-window-sheet-title"
        className="fixed bottom-0 left-0 right-0 z-[70] bg-white animate-slide-up flex flex-col"
        style={{ borderRadius: "28px 28px 0 0", maxHeight: "85vh" }}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-11 h-1.5 rounded-full bg-gray-200" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
          <h2 id="new-window-sheet-title" className="text-[18px] font-extrabold text-gray-900">
            Deraza turi
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Yopish"
            className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-[13px] font-bold"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <WindowStylePicker value={styleId} onPick={setStyleId} title="Turi" />

          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mt-5 mb-1">
            O'lchamlar
          </p>
          <div className="bg-[#F9FAFB] rounded-2xl px-4">
            <DimStepper
              label="Kenglik"
              value={width} onChange={setWidth}
              min={400} max={3000} step={100}
            />
            <DimStepper
              label="Balandlik"
              value={height} onChange={setHeight}
              min={400} max={3000} step={100}
            />
            <DimStepper
              label="Poldan balandlik"
              value={sillHeight} onChange={setSillHeight}
              min={0} max={2000} step={100}
            />
          </div>

          <p className="text-[11px] font-bold text-muted uppercase tracking-wider mt-5 mb-2">
            Rom rangi
          </p>
          <div className="flex gap-2.5">
            {FRAME_COLORS.map((hex) => (
              <button
                key={hex}
                onClick={() => setLeafColor(hex)}
                aria-label={hex}
                aria-pressed={leafColor === hex}
                className="w-9 h-9 rounded-full"
                style={{
                  background: hex,
                  border: leafColor === hex ? "2.5px solid #2563EB" : "1px solid rgba(0,0,0,0.15)",
                  boxShadow: leafColor === hex ? "0 0 0 2px #FFFFFF inset" : undefined,
                }}
              />
            ))}
          </div>

          <button
            onClick={handleConfirm}
            className="mt-6 w-full py-3 bg-brand text-white rounded-[18px] font-bold text-[16px] active:scale-[0.98] transition-transform"
          >
            + Deraza qo'shish
          </button>
        </div>
      </div>
    </>
  );
}
