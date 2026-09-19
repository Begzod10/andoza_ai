import * as React from "react";
import { useRoomStore } from "@/store/roomStore";
import type { DesignState } from "@/store/roomStore";
import {
  CEILING_DESIGNS, CEILING_SETTING_RANGE, DEFAULT_CEILING_DESIGN,
  ceilingDesign, resolveCeilingSettings,
  type CeilingDesignId, type CeilingSettings, type CeilingSettingKey,
} from "@/lib/ceilingDesigns";
import {
  trimProfilesOf, trimProfileSvgPath, resolveTrim,
  TRIM_HEIGHT_RANGE_MM, TRIM_WIDTH_RANGE_MM, type TrimProfileDef,
} from "@/lib/trimProfiles";
import { lightType } from "@/lib/lightCatalog";
import { CeilingPreview } from "@/lib/ceilingPreview";

/**
 * Ceiling profile + settings — shown from WallSection when the "Shift"
 * target is selected. Self-contained apart from `syncToApi`, which stays a
 * single shared instance owned by DesignPanel (see WallSection's own props
 * doc for why).
 */
// Human names for the swatches below, in the same convention as WallSection's
// WALL_COLOR_NAMES — without these, screen readers and colorblind users have
// no way to tell the buttons apart (a raw hex string reads out as noise).
const CEILING_COLOR_NAMES: Record<string, string> = {
  "#FFFFFF": "Oq",
  "#F4F1EA": "Fil suyagi",
  "#EDE9E0": "Qum",
  "#E3E6E8": "Kumush",
  "#D8D3C8": "Kul-bej",
};

export function CeilingTargetPanel({ syncToApi }: {
  syncToApi: (ds: DesignState) => void;
}) {
  const settingsIdBase = React.useId();
  const designState = useRoomStore((s) => s.designState);
  const setDesignState = useRoomStore((s) => s.setDesignState);

  const ceilingCfg = designState.ceiling ?? { design: DEFAULT_CEILING_DESIGN };
  const activeCeiling = ceilingDesign(ceilingCfg.design);
  const ceilingSettings = resolveCeilingSettings(activeCeiling, ceilingCfg.settings);

  function handleSetCeilingDesign(id: CeilingDesignId) {
    // Settings are kept across a switch: a border width chosen for one profile
    // is still the border width the room wants under the next one.
    const next = { design: id, settings: ceilingCfg.settings };
    setDesignState({ ceiling: next });
    syncToApi({ ...designState, ceiling: next });
  }

  function handleCeilingSetting(patch: Partial<CeilingSettings>) {
    const next = { ...ceilingCfg, settings: { ...ceilingCfg.settings, ...patch } };
    setDesignState({ ceiling: next });
    syncToApi({ ...designState, ceiling: next });
  }

  return (
    <>
      <section>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Shift turi</h3>
        <p className="text-xs text-gray-500 mb-3">
          Shift shakli xonaning balandligi va yorug'ligini belgilaydi.
        </p>
        <div className="space-y-2">
          {CEILING_DESIGNS.map((cd) => {
            const active = ceilingCfg.design === cd.id;
            return (
              <button
                key={cd.id}
                onClick={() => handleSetCeilingDesign(cd.id)}
                className={`w-full text-left px-3 py-2.5 rounded-card border-2 transition-colors ${
                  active ? "border-brand bg-brand/10" : "border-gray-200 hover:border-brand/40"
                }`}
              >
                <span className="flex items-start gap-2.5">
                  <CeilingPreview
                    designId={cd.id}
                    className="w-12 h-8 flex-shrink-0 mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${active ? "text-brand font-semibold" : "text-gray-700"}`}>
                      {cd.label}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{cd.hint}</span>
                    {/* The fixtures that belong with this profile — the pairing
                        is half of what makes each one look like itself. */}
                    <span className="flex flex-wrap gap-1 mt-1.5">
                      {cd.lighting.map((id) => (
                        <span
                          key={id}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200"
                        >
                          {lightType(id).emoji} {lightType(id).name}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Only the settings this profile responds to. The rest are inert
          for it, and a slider that does nothing is worse than no slider. */}
      {activeCeiling.uses.some((k) => k !== 'color') && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Sozlamalar</h3>

          {activeCeiling.uses.includes('strip') && (
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-xs text-gray-600 font-medium">Yashirin LED lenta</span>
              <input
                type="checkbox"
                checked={ceilingSettings.strip}
                onChange={(e) => handleCeilingSetting({ strip: e.target.checked })}
                className="accent-brand w-4 h-4"
              />
            </label>
          )}

          {(Object.keys(CEILING_SETTING_RANGE) as (keyof typeof CEILING_SETTING_RANGE)[])
            .filter((key) => activeCeiling.uses.includes(key as CeilingSettingKey))
            .filter((key) => key !== 'stripK' || ceilingSettings.strip)
            .map((key) => {
              const range = CEILING_SETTING_RANGE[key];
              const inputId = `${settingsIdBase}-${key}`;
              return (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor={inputId} className="text-xs text-gray-600 font-medium">{range.label}</label>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {ceilingSettings[key]} {range.unit}
                    </span>
                  </div>
                  <input
                    id={inputId}
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={ceilingSettings[key]}
                    onChange={(e) => handleCeilingSetting({ [key]: Number(e.target.value) })}
                    className="w-full accent-brand cursor-pointer"
                  />
                </div>
              );
            })}

          <div>
            <span className="text-xs text-gray-600 font-medium block mb-1.5">Shift rangi</span>
            <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Shift rangi">
              {["#FFFFFF", "#F4F1EA", "#EDE9E0", "#E3E6E8", "#D8D3C8"].map((c) => {
                const active = ceilingSettings.color === c;
                const name = CEILING_COLOR_NAMES[c] ?? c;
                return (
                  <button
                    key={c}
                    onClick={() => handleCeilingSetting({ color: c })}
                    style={{ background: c }}
                    title={name}
                    aria-label={name}
                    aria-selected={active}
                    role="option"
                    className={`w-11 h-11 rounded-full border-2 transition-colors ${
                      active ? "border-brand" : "border-gray-200"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      <CorniceGroup syncToApi={syncToApi} />
    </>
  );
}


/**
 * "Galtel" — the ceiling cornice: which moulding runs round the wall/ceiling
 * junction, and the two numbers it takes. Unlike the skirting this is opt-in,
 * so an absent choice means no cornice and the thumbnails double as the add
 * control.
 */
function CorniceGroup({ syncToApi }: { syncToApi: (ds: DesignState) => void }) {
  const designState = useRoomStore((s) => s.designState);
  const setDesignState = useRoomStore((s) => s.setDesignState);

  const profiles = trimProfilesOf("cornice");
  const on = !!designState.cornice;
  const active = resolveTrim(designState.cornice, "cornice");
  const hRange = TRIM_HEIGHT_RANGE_MM.cornice;
  const wRange = TRIM_WIDTH_RANGE_MM.cornice;

  function apply(cornice: DesignState["cornice"]) {
    setDesignState({ cornice });
    syncToApi({ ...designState, cornice });
  }

  /** Switching profile adopts that profile's own catalogue sizes. */
  function pick(def: TrimProfileDef) {
    apply({ id: def.id, heightMm: def.defaultHeightMm, widthMm: def.defaultWidthMm });
  }

  function patch(p: { heightMm?: number; widthMm?: number }) {
    apply({
      id: active.def.id,
      heightMm: Math.round(active.heightM * 1000),
      widthMm: Math.round(active.widthM * 1000),
      ...p,
    });
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Galtel</h3>
      <p className="text-xs text-gray-500 mb-3">
        Shift va devor burchagidagi bezak carvog'i.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {profiles.map((def) => {
          const sel = on && active.def.id === def.id;
          return (
            <button
              key={def.id}
              onClick={() => pick(def)}
              title={def.label}
              className={`rounded-card border-2 p-1 pb-1.5 text-left transition-colors ${
                sel ? "border-brand bg-brand/10" : "border-gray-200 hover:border-brand/40"
              }`}
            >
              <CorniceThumb def={def} />
              <span className={`block mt-1 text-[10px] leading-tight ${sel ? "text-brand font-semibold" : "text-gray-600"}`}>
                {def.label}
              </span>
            </button>
          );
        })}
      </div>

      {on ? (
        <>
          <div className="mt-3 space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sozlamalar</h3>
            <TrimSlider
              label="Balandligi" min={hRange.min} max={hRange.max} step={5}
              value={Math.round(active.heightM * 1000)}
              onChange={(v) => patch({ heightMm: v })}
            />
            <TrimSlider
              label="Eni" min={wRange.min} max={wRange.max} step={5}
              value={Math.round(active.widthM * 1000)}
              onChange={(v) => patch({ widthMm: v })}
            />
          </div>
          <button
            onClick={() => apply(null)}
            className="mt-2 w-full py-2 text-xs font-medium text-red-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-card transition-colors"
          >
            Galtelni olib tashlash
          </button>
        </>
      ) : (
        <button
          onClick={() => pick(profiles[0])}
          className="mt-2 w-full py-2 text-xs font-medium text-brand border border-gray-200 hover:border-brand/50 rounded-card transition-colors"
        >
          Galtel qo'shish
        </button>
      )}
    </section>
  );
}

/** The cornice's real cross-section: ceiling along the top, wall down the left. */
function CorniceThumb({ def }: { def: TrimProfileDef }) {
  const d = React.useMemo(() => trimProfileSvgPath(def, true), [def]);
  return (
    <svg viewBox="-6 -6 112 112" className="w-full aspect-square rounded-md bg-gray-50" aria-hidden>
      <path d="M-6,0 L106,0" stroke="#CBD5E1" strokeWidth="3" fill="none" />
      <path d="M0,-6 L0,106" stroke="#CBD5E1" strokeWidth="3" fill="none" />
      <path d={d} fill="#E8E4DA" stroke="#8A7F6D" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function TrimSlider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange(v: number): void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums text-gray-700">{value} mm</span>
      </span>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand"
      />
    </label>
  );
}
