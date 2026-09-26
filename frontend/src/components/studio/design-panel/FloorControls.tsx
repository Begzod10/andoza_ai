import { useId, useMemo } from "react";
import {
  FLOOR_PATTERN_DEFS, DEFAULT_GAP_MM, DEFAULT_BEVEL_MM, computeFloorPieces, insetConvexPoly,
  pieceShade, shadeColor, floorSlabColor,
  floorPatternDef, type FloorPatternDef, type FloorPatternId, type FloorPatternSettings,
} from "@/lib/floorGeometry";
import {
  trimProfilesOf, trimProfileSvgPath, resolveTrim,
  TRIM_HEIGHT_RANGE_MM, TRIM_WIDTH_RANGE_MM, type TrimProfileDef,
} from "@/lib/trimProfiles";
import { FLOOR_COLORS } from "@/pages/studio/three-d/constants";
import { useRoomStore } from "@/store/roomStore";

/**
 * The floor controls that belong to the floor itself rather than to the
 * panel you happen to be standing in: the laying pattern (Naqsh) with its
 * settings, and the skirting (Plintus) with its.
 *
 * Both the "Pol" phase panel (FloorSection) and the "Pol" target inside the
 * Bo'yoq wall panel (WallFloorTargetPanel) render these, so the floor offers
 * the same capabilities wherever you reach it — on mobile the wall panel's
 * Pol target is the path most users actually take (the radial menu's "Rang"
 * on the floor lands there), and it used to be a strict subset of the phase
 * panel, with no way at all to lay a pattern or pick a skirting.
 *
 * They read and write the design store directly, so neither host has to
 * thread callbacks through for them.
 */

/** "Naqsh" — the real-geometry laying-pattern picker plus its Sozlamalar. */
export function FloorPatternGroup() {
  const floorType = useRoomStore((s) => s.designState.floorType);
  const floorTexture = useRoomStore((s) => s.designState.floorTexture);
  const floorPattern = useRoomStore((s) => s.designState.floorPattern);
  const setDesignState = useRoomStore((s) => s.setDesignState);

  const baseColor = FLOOR_COLORS[floorType] ?? FLOOR_COLORS.parquet;

  /** The image currently on the floor — the pattern's plank texture when a
   *  pattern is laid, otherwise the legacy whole-floor image. */
  const activeTextureUrl = floorPattern ? (floorPattern.settings?.textureUrl ?? null) : (floorTexture ?? null);

  /** Selecting a pattern keeps the tone/joint knobs the user already dialed
   *  in and resets the plank dimensions to the new pattern's classic sizes.
   *  A whole-floor image already chosen carries over as the plank texture, so
   *  laying a pattern over it keeps showing the wood the user picked. */
  function applyPattern(id: FloorPatternId) {
    const prev = floorPattern?.settings;
    const kept: FloorPatternSettings = {};
    if (prev?.baseColor != null) kept.baseColor = prev.baseColor;
    if (prev?.gapMm != null) kept.gapMm = prev.gapMm;
    if (prev?.bevelMm != null) kept.bevelMm = prev.bevelMm;
    if (prev?.colorVariation != null) kept.colorVariation = prev.colorVariation;
    if (prev?.rotationDeg != null) kept.rotationDeg = prev.rotationDeg;
    const carried = prev?.textureUrl ?? floorTexture ?? null;
    if (carried) kept.textureUrl = carried;
    setDesignState({
      floorPattern: { id, settings: kept },
      floorConfigured: true,
    });
  }

  function patchSettings(patch: Partial<FloorPatternSettings>) {
    if (!floorPattern) return;
    setDesignState({
      floorPattern: { id: floorPattern.id, settings: { ...floorPattern.settings, ...patch } },
    });
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Naqsh</h3>
      <div className="grid grid-cols-3 gap-2">
        {FLOOR_PATTERN_DEFS.map((def) => {
          const active = floorPattern?.id === def.id;
          return (
            <button
              key={def.id}
              onClick={() => applyPattern(def.id)}
              className={`rounded-card border-2 p-1 pb-1.5 text-left transition-colors ${
                active ? "border-brand bg-brand/10" : "border-gray-200 hover:border-brand/40"
              }`}
              title={def.label}
            >
              <PatternThumb
                def={def}
                color={floorPattern?.settings?.baseColor ?? baseColor}
                textureUrl={activeTextureUrl}
              />
              <span className={`block mt-1 text-[10px] leading-tight ${active ? "text-brand font-semibold" : "text-gray-600"}`}>
                {def.label}
              </span>
            </button>
          );
        })}
      </div>
      {floorPattern && (
        <>
          <PatternSettings
            def={floorPatternDef(floorPattern.id) ?? FLOOR_PATTERN_DEFS[0]}
            settings={floorPattern.settings}
            typeColor={baseColor}
            onPatch={patchSettings}
          />
          <button
            onClick={() => setDesignState({ floorPattern: null })}
            className="mt-2 w-full py-2 text-xs font-medium text-red-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-card transition-colors"
          >
            Naqshni olib tashlash
          </button>
        </>
      )}
    </div>
  );
}


/**
 * "Plintus" — the floor skirting: which milled profile runs along the wall
 * feet, and the only two numbers it takes.
 *
 * Three stored states, mirroring how the 3D shell reads them: `undefined` is
 * "never touched" and still draws the default board, `null` is off, and an
 * object is an explicit choice. Picking any profile while it is off turns it
 * back on, so the thumbnails double as the add control.
 */
export function SkirtingGroup() {
  const skirting = useRoomStore((s) => s.designState.skirting);
  const setDesignState = useRoomStore((s) => s.setDesignState);

  const profiles = trimProfilesOf("skirting");
  const off = skirting === null;
  const active = resolveTrim(skirting, "skirting");
  const hRange = TRIM_HEIGHT_RANGE_MM.skirting;
  const wRange = TRIM_WIDTH_RANGE_MM.skirting;

  /** Switching profile adopts that profile's own catalogue sizes, the same way
   *  picking a laying pattern resets the plank dimensions above. */
  function pick(def: TrimProfileDef) {
    setDesignState({ skirting: { id: def.id, heightMm: def.defaultHeightMm, widthMm: def.defaultWidthMm } });
  }

  function patch(p: { heightMm?: number; widthMm?: number }) {
    setDesignState({
      skirting: {
        id: active.def.id,
        heightMm: Math.round(active.heightM * 1000),
        widthMm: Math.round(active.widthM * 1000),
        ...p,
      },
    });
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Plintus</h3>
      <div className="grid grid-cols-3 gap-2">
        {profiles.map((def) => {
          const on = !off && active.def.id === def.id;
          return (
            <button
              key={def.id}
              onClick={() => pick(def)}
              title={def.label}
              className={`rounded-card border-2 p-1 pb-1.5 text-left transition-colors ${
                on ? "border-brand bg-brand/10" : "border-gray-200 hover:border-brand/40"
              }`}
            >
              <TrimThumb def={def} />
              <span className={`block mt-1 text-[10px] leading-tight ${on ? "text-brand font-semibold" : "text-gray-600"}`}>
                {def.label}
              </span>
            </button>
          );
        })}
      </div>

      {off ? (
        <button
          onClick={() => setDesignState({ skirting: { id: profiles[0].id } })}
          className="mt-2 w-full py-2 text-xs font-medium text-brand border border-gray-200 hover:border-brand/50 rounded-card transition-colors"
        >
          Plintusni qo'shish
        </button>
      ) : (
        <>
          <div className="mt-3 space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sozlamalar</h3>
            <SettingSlider
              label="Balandligi" unit=" mm" min={hRange.min} max={hRange.max} step={5}
              value={Math.round(active.heightM * 1000)}
              onChange={(v) => patch({ heightMm: v })}
            />
            <SettingSlider
              label="Eni" unit=" mm" min={wRange.min} max={wRange.max} step={1}
              value={Math.round(active.widthM * 1000)}
              onChange={(v) => patch({ widthMm: v })}
            />
          </div>
          <button
            onClick={() => setDesignState({ skirting: null })}
            className="mt-2 w-full py-2 text-xs font-medium text-red-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-card transition-colors"
          >
            Plintusni olib tashlash
          </button>
        </>
      )}
    </div>
  );
}

/** The profile's real cross-section, drawn from the same outline the 3D
 *  extrusion uses — wall on the left, floor along the bottom. */
function TrimThumb({ def }: { def: TrimProfileDef }) {
  const d = useMemo(() => trimProfileSvgPath(def), [def]);
  return (
    <svg viewBox="-6 -6 112 112" className="w-full aspect-square rounded-md bg-gray-50" aria-hidden>
      {/* the wall face and the floor line the profile sits against */}
      <path d="M0,-6 L0,106" stroke="#CBD5E1" strokeWidth="3" fill="none" />
      <path d="M-6,100 L106,100" stroke="#CBD5E1" strokeWidth="3" fill="none" />
      <path d={d} fill="#D8CEBF" stroke="#8A7F6D" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}


/**
 * Pattern thumbnail — the actual layout math from lib/floorGeometry drawn as
 * SVG over a small patch of "floor", so the preview is the real arrangement
 * (mitred chevron, Versailles trellis, ...) rather than an icon of it.
 */
function PatternThumb({ def, color, textureUrl }: {
  def: FloorPatternDef; color: string; textureUrl?: string | null;
}) {
  const patId = useId();
  const polys = useMemo(() => {
    const span = def.thumbSpanM;
    const { classes, resolved } = computeFloorPieces({ id: def.id }, span, span, color);
    const out: { pts: string; fill: string }[] = [];
    const k = 100 / span;
    for (const cls of classes) {
      const foot = insetConvexPoly(cls.poly, resolved.gapM / 2);
      for (const p of cls.pieces) {
        const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
        const pts = foot
          .map(([x, z]) => {
            const wx = p.x + x * cos - z * sin;
            const wz = p.z + x * sin + z * cos;
            return `${(50 + wx * k).toFixed(1)},${(50 + wz * k).toFixed(1)}`;
          })
          .join(" ");
        out.push({ pts, fill: shadeColor(color, pieceShade(p, resolved)) });
      }
    }
    return out;
  }, [def, color]);

  // With a texture chosen, the pieces are filled from the image rather than
  // the flat tone — one tile for the whole thumbnail (the per-plank UV the 3D
  // floor uses would need two SVG nodes per plank, far too heavy at this size).
  // The joint strokes still carry the layout, which is what the grid is for.
  const joint = textureUrl ? "#2A2521" : floorSlabColor(color);
  return (
    <svg viewBox="0 0 100 100" className="w-full aspect-square rounded-md" aria-hidden>
      {textureUrl && (
        <defs>
          <pattern id={patId} patternUnits="userSpaceOnUse" width="42" height="42">
            <image href={textureUrl} x="0" y="0" width="42" height="42" preserveAspectRatio="xMidYMid slice" />
          </pattern>
        </defs>
      )}
      <rect x="0" y="0" width="100" height="100" fill={joint} />
      {polys.map((p, i) => (
        <polygon key={i} points={p.pts} fill={textureUrl ? `url(#${patId})` : p.fill} stroke={joint} strokeWidth="0.7" />
      ))}
    </svg>
  );
}


function SettingSlider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange(v: number): void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums text-gray-700">{value}{unit}</span>
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

/** "Sozlamalar" — compact live controls for the active pattern. */
function PatternSettings({ def, settings, typeColor, onPatch }: {
  def: FloorPatternDef;
  settings: FloorPatternSettings | undefined;
  /** The floor type's palette colour — the tone used while no override is set. */
  typeColor: string;
  onPatch(patch: Partial<FloorPatternSettings>): void;
}) {
  const s = settings ?? {};
  const rotation = s.rotationDeg ?? 0;
  return (
    <div className="mt-3 space-y-2.5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sozlamalar</h3>
      {def.usesLength && (
        <SettingSlider
          label="Taxta uzunligi" unit=" sm" min={10} max={300} step={1}
          value={s.plankLengthCm ?? def.defaultLengthCm}
          onChange={(v) => onPatch({ plankLengthCm: v })}
        />
      )}
      <SettingSlider
        label="Taxta eni" unit=" sm" min={3} max={40} step={1}
        value={s.plankWidthCm ?? def.defaultWidthCm}
        onChange={(v) => onPatch({ plankWidthCm: v })}
      />
      <SettingSlider
        label="Oraliq" unit=" mm" min={0} max={8} step={0.5}
        value={s.gapMm ?? DEFAULT_GAP_MM}
        onChange={(v) => onPatch({ gapMm: v })}
      />
      <SettingSlider
        label="Faska (qirra)" unit=" mm" min={0} max={3} step={0.5}
        value={s.bevelMm ?? DEFAULT_BEVEL_MM}
        onChange={(v) => onPatch({ bevelMm: v })}
      />
      <SettingSlider
        label="Rang o'zgarishi" unit="%" min={0} max={100} step={5}
        value={Math.round((s.colorVariation ?? 0.5) * 100)}
        onChange={(v) => onPatch({ colorVariation: v / 100 })}
      />
      <div className="flex items-center gap-2">
        {/* With a texture on the planks the colour multiplies over the image
            (white = the image's own colours), so it stays useful for warming
            or darkening a photo instead of being ignored. */}
        <span className="text-xs text-gray-500 flex-1">
          {s.textureUrl ? "Rang (tekstura ustidan)" : "Yog'och rangi"}
        </span>
        <input
          type="color"
          value={s.baseColor ?? (s.textureUrl ? "#ffffff" : typeColor)}
          onChange={(e) => onPatch({ baseColor: e.target.value })}
          className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer bg-transparent"
        />
        {s.baseColor && (
          <button
            onClick={() => onPatch({ baseColor: undefined })}
            className="text-[10px] text-gray-400 hover:text-gray-600"
            title={s.textureUrl ? "Teksturaning o'z rangiga qaytarish" : "Pol turi rangiga qaytarish"}
          >
            Bekor
          </button>
        )}
      </div>
      <div>
        <span className="text-xs text-gray-500 block mb-1">Burilish</span>
        <div className="flex gap-1.5">
          {([0, 45, 90] as const).map((deg) => (
            <button
              key={deg}
              onClick={() => onPatch({ rotationDeg: deg })}
              className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${
                rotation === deg
                  ? "border-brand bg-brand/10 text-brand font-semibold"
                  : "border-gray-200 text-gray-600 hover:border-brand/40"
              }`}
            >
              {deg}°
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
