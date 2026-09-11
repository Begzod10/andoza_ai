import * as React from "react";
import { useRoomStore } from "@/store/roomStore";
import type { DesignState } from "@/store/roomStore";
import {
  CEILING_DESIGNS, CEILING_SETTING_RANGE, DEFAULT_CEILING_DESIGN,
  ceilingDesign, resolveCeilingSettings,
  type CeilingDesignId, type CeilingSettings, type CeilingSettingKey,
} from "@/lib/ceilingDesigns";
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
    </>
  );
}
