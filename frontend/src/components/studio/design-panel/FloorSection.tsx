import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listWallpapers, uploadWallpaper } from "@/lib/api";
import {
  FLOOR_PATTERN_DEFS, DEFAULT_GAP_MM, DEFAULT_BEVEL_MM, computeFloorPieces, insetConvexPoly,
  pieceShade, shadeColor, floorSlabColor,
  floorPatternDef, type FloorPatternDef, type FloorPatternId, type FloorPatternSettings,
} from "@/lib/floorGeometry";
import { FLOOR_COLORS } from "@/pages/studio/three-d/constants";
import { useRoomStore } from "@/store/roomStore";
import { uz } from "@/locale/uz";
import { FLOOR_TYPES } from "./shared";

/**
 * "Pol" phase — the floor-type picker, the real-geometry laying-pattern
 * picker (Naqsh) with its settings, plus a custom floor-image upload.
 * (The full-featured floor editor, with do'kon material search and UVW
 * controls, lives inside WallSection's own "Pol" wall-target — this stays the
 * simpler top-level phase tab.)
 */
export function FloorSection({ onSetFloorType }: {
  onSetFloorType(type: string): void;
}) {
  const floorType = useRoomStore((s) => s.designState.floorType);
  const floorTexture = useRoomStore((s) => s.designState.floorTexture);
  const floorPattern = useRoomStore((s) => s.designState.floorPattern);
  const setFloorTexture = useRoomStore((s) => s.setFloorTexture);
  const setDesignState = useRoomStore((s) => s.setDesignState);
  const queryClient = useQueryClient();

  const baseColor = FLOOR_COLORS[floorType] ?? FLOOR_COLORS.parquet;

  /** The floor-image library: the same shared media table the walls use, in
   *  its own 'pol' bucket, so floor images never show up in a wall picker. */
  const polLibrary = useQuery({
    queryKey: ["wallpapers", "pol"],
    queryFn: () => listWallpapers({ kind: "pol" }),
    staleTime: 60_000,
  });

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

  /** Apply an image to whatever the floor currently is: the pattern's planks
   *  when a pattern is laid, else the legacy flat floor. */
  function applyTexture(url: string | null) {
    setDesignState({ floorConfigured: true });
    if (floorPattern) patchSettings({ textureUrl: url });
    else setFloorTexture(url);
  }

  function patchSettings(patch: Partial<FloorPatternSettings>) {
    if (!floorPattern) return;
    setDesignState({
      floorPattern: { id: floorPattern.id, settings: { ...floorPattern.settings, ...patch } },
    });
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Custom floor image → shared media library (only the URL is kept, exactly
   * like a wall image). Mirrors WallFloorTargetPanel.handleFloorTextureUpload:
   * if the upload can't reach the server we still show it from a data URL, but
   * say plainly it won't survive a reload rather than pretend it was saved.
   */
  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Faqat rasm fayllari (JPG, PNG, WEBP...)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadWallpaper(file, { kind: "pol" });
      applyTexture(uploaded.url);
      queryClient.invalidateQueries({ queryKey: ["wallpapers", "pol"] });
    } catch (err) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (url) applyTexture(url);
      };
      reader.readAsDataURL(file);
      setError(
        `Serverga saqlanmadi${err instanceof Error && err.message ? `: ${err.message}` : ""} — ` +
          "rasm hozir ko'rinadi, lekin sahifa yangilansa yo'qoladi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.pol_turi}</h3>
      <div className="space-y-2">
        {FLOOR_TYPES.map((ft) => (
          <button
            key={ft.key}
            // Picking a preset clears any custom image so the type takes effect.
            onClick={() => { if (floorTexture) setFloorTexture(null); onSetFloorType(ft.key); }}
            className={`w-full text-left px-3 py-2.5 rounded-card text-sm border-2 transition-colors ${
              floorType === ft.key && !floorTexture
                ? "border-brand bg-brand/10 text-brand font-semibold"
                : "border-gray-200 hover:border-brand/40 text-gray-700"
            }`}
          >
            {ft.label}
          </button>
        ))}
      </div>

      {/* Laying pattern (real 3D plank geometry) */}
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

      {/* Floor image: the plank texture when a pattern is laid, otherwise the
          whole-floor image. Same 'pol' library either way. */}
      <div className="mt-5 space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {floorPattern ? "Taxta teksturasi" : "Pol rasmi"}
        </h3>
        <p className="text-[11px] text-gray-500 leading-snug">
          {floorPattern
            ? "Rasm har bir taxtaga alohida yopishtiriladi — o'lcham taxta o'lchamiga teng."
            : "Rasm butun polga yoyiladi."}
        </p>
        {polLibrary.data && polLibrary.data.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {polLibrary.data.map((w) => {
              const on = activeTextureUrl === w.url;
              return (
                <button
                  key={w.id}
                  onClick={() => applyTexture(w.url)}
                  title={w.name}
                  className={`rounded-lg overflow-hidden border-2 transition-colors ${
                    on ? "border-brand" : "border-gray-200 hover:border-brand/40"
                  }`}
                >
                  <img src={w.url} alt={w.name} className="w-full aspect-square object-cover" />
                </button>
              );
            })}
          </div>
        )}
        {activeTextureUrl && floorPattern && (
          <div>
            <span className="text-xs text-gray-500 block mb-1">Tekstura burilishi</span>
            <div className="flex gap-1.5">
              {([0, 90] as const).map((deg) => {
                const on = (floorPattern.settings?.textureRotation ?? 0) === deg;
                return (
                  <button
                    key={deg}
                    onClick={() => patchSettings({ textureRotation: deg })}
                    className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${
                      on ? "border-brand bg-brand/10 text-brand font-semibold"
                        : "border-gray-200 text-gray-600 hover:border-brand/40"
                    }`}
                  >
                    {deg}°
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {activeTextureUrl && (
          <button
            onClick={() => applyTexture(null)}
            className="w-full py-1.5 text-xs font-medium text-red-500 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded-card transition-colors"
          >
            Teksturani olib tashlash
          </button>
        )}
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">O'z rasmingiz</h3>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => { setError(null); fileRef.current?.click(); }}
          disabled={busy}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-brand/50 hover:text-brand transition-colors disabled:opacity-50"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="text-sm font-medium">{busy ? "Yuklanmoqda…" : "Rasm yuklash"}</span>
          <span className="text-xs text-gray-500">JPG, PNG, WEBP · 15 MB gacha</span>
        </button>
        {error && <p className="text-xs text-amber-600 leading-snug">{error}</p>}
        {activeTextureUrl && (
          <div className="flex items-center gap-2">
            <img src={activeTextureUrl} alt="Pol rasmi" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
            <span className="flex-1 text-xs text-gray-600">
              {floorPattern ? "Taxtalarga qo'llandi" : "Rasm qo'llandi"}
            </span>
            <button
              onClick={() => applyTexture(null)}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              O'chirish
            </button>
          </div>
        )}
      </div>
    </section>
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
