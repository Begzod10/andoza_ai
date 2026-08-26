import * as React from "react";
import { WINDOW_STYLES } from "@/lib/windowStyles";
import { WindowElevation } from "@/features/studio/WindowElevation";
import { WindowEditor, DoorEditor } from "@/components/studio/DoorLeaves";
import type { WallElement } from "@/store/roomStore";

/**
 * Two panels for wall openings, both driven from the studio page:
 *  - `OpeningCreateSheet` — the bottom sheet shown right after a wall's radial
 *    "Oyna"/"Eshik" action, where the size + type are chosen *before* the
 *    opening is cut into the wall.
 *  - `OpeningEditPanel` — the same detail editor as before, but rendered inside
 *    the right-hand drawer (never floating over the canvas), shown only while an
 *    opening is selected. It reuses the existing `WindowEditor`/`DoorEditor`.
 */

export interface OpeningCreateValues {
  width: number;
  height: number;
  sill_height: number;
  styleId?: string;
  hinge?: "left" | "right";
}

const WIN_DEFAULTS: OpeningCreateValues = { width: 900, height: 1200, sill_height: 900, styleId: "single" };
const DOOR_DEFAULTS: OpeningCreateValues = { width: 900, height: 2100, sill_height: 0, hinge: "left" };

// Kept in step with LIMITS in DoorLeaves.tsx.
const LIM = {
  deraza: { minW: 300, maxW: 3000, minH: 300, maxH: 2400, minSill: 0, maxSill: 1800 },
  eshik: { minW: 500, maxW: 2400, minH: 1400, maxH: 2600 },
} as const;

function NumField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? String(value);
  const parsed = draft !== null ? parseFloat(draft) : value;
  const invalid = draft !== null && (isNaN(parsed) || parsed < min || parsed > max);
  return (
    <div className="flex-1">
      <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
        onBlur={() => {
          if (draft !== null && !isNaN(parsed) && parsed >= min && parsed <= max) onChange(Math.round(parsed));
          setDraft(null);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={`w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none transition-colors ${
          invalid ? "border-red-400 bg-red-50" : "border-gray-200 focus:border-brand"
        }`}
      />
    </div>
  );
}

export function OpeningCreateSheet({ kind, onCancel, onConfirm }: {
  kind: "deraza" | "eshik";
  onCancel: () => void;
  onConfirm: (vals: OpeningCreateValues) => void;
}) {
  const isDoor = kind === "eshik";
  const lim = LIM[kind];
  const [vals, setVals] = React.useState<OpeningCreateValues>(isDoor ? DOOR_DEFAULTS : WIN_DEFAULTS);
  const set = (patch: Partial<OpeningCreateValues>) => setVals((v) => ({ ...v, ...patch }));

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-2xl shadow-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          {isDoor ? "Eshik qo'shish" : "Oyna qo'shish"}
        </h3>
        <button
          onClick={onCancel}
          aria-label="Bekor"
          className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2">
        <NumField label="Eni (mm)" value={vals.width} min={lim.minW} max={lim.maxW} onChange={(v) => set({ width: v })} />
        <NumField label="Bo'yi (mm)" value={vals.height} min={lim.minH} max={lim.maxH} onChange={(v) => set({ height: v })} />
      </div>

      {!isDoor && (
        <NumField
          label="Pol'dan balandligi (mm)"
          value={vals.sill_height}
          min={LIM.deraza.minSill}
          max={LIM.deraza.maxSill}
          onChange={(v) => set({ sill_height: v })}
        />
      )}

      {!isDoor ? (
        <div>
          <div className="text-[11px] text-gray-500 mb-1.5">Deraza turi</div>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {WINDOW_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => set({ styleId: s.id })}
                title={s.label}
                className="flex-none w-12 h-14 p-1 rounded-lg"
                style={{
                  border: vals.styleId === s.id ? "1.5px solid #2563EB" : "1px solid #E5E7EB",
                  background: vals.styleId === s.id ? "#EFF6FF" : "#fff",
                }}
              >
                <WindowElevation style={s} strokeWidth={0.9} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[11px] text-gray-500 mb-1.5">Ochilish tomoni</div>
          <div className="flex gap-2">
            {(["left", "right"] as const).map((side) => (
              <button
                key={side}
                onClick={() => set({ hinge: side })}
                className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                  vals.hinge === side ? "border-brand bg-brand/10 text-brand" : "border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {side === "left" ? "Chap" : "O'ng"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
        >
          Bekor
        </button>
        <button
          onClick={() => onConfirm(vals)}
          className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 transition-opacity"
        >
          Qo'shish
        </button>
      </div>
    </div>
  );
}

export function OpeningEditPanel({ el, kind, styleId, mode, onMode, onPatch, onDelete }: {
  el: WallElement;
  kind: "deraza" | "eshik";
  styleId: string;
  mode: "idle" | "move";
  onMode: (m: "idle" | "move") => void;
  onPatch: (patch: Partial<WallElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2.5">
      {/* Surish: enable drag-to-move in the 3D viewport (resize is the size
          fields below). Was a floating toolbar button; now lives here. */}
      <button
        onClick={() => onMode(mode === "move" ? "idle" : "move")}
        className={`w-full py-2 text-sm font-medium rounded-lg border transition-colors ${
          mode === "move" ? "bg-brand text-white border-brand" : "border-gray-200 text-gray-700 hover:bg-gray-100"
        }`}
      >
        {mode === "move" ? "✓ Surish yoqildi — 3D da suring" : "✥ Surish (joyini o'zgartirish)"}
      </button>

      {kind === "eshik"
        ? <DoorEditor el={el} onPatch={onPatch} onDelete={onDelete} />
        : <WindowEditor el={el} styleId={styleId} onPatch={onPatch} onDelete={onDelete} />}
    </div>
  );
}
