import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getMaterials, previewEstimate } from "@/lib/api";
import type { Room, Material } from "@/lib/api";
import { uz } from "@/locale/uz";
import { useRoomStore, resolveWallColor } from "@/store/roomStore";
import type { WallCovering, DesignState } from "@/store/roomStore";
import { OBOY_PATTERNS, getOboySvgPattern } from "@/lib/oboyPatterns";
import type { OboyPatternId } from "@/lib/oboyPatterns";
import { computeOboyRolls } from "@/lib/oboySmeta";
import { useDebounce } from "@/hooks/useDebounce";
import { WALL_TARGETS, resolveTargetWall, type WallTarget } from "./shared";
import { CeilingTargetPanel } from "./CeilingTargetPanel";
import { WallFloorTargetPanel } from "./WallFloorTargetPanel";
import { WallPanelGenerator } from "./WallPanelGenerator";

type CoveringMode = "paint" | "oboy" | "texture";

const WALL_COLORS = [
  "#FFFFFF", "#F5F0E8", "#E8D5C4", "#D4E8D4",
  "#C4D4E8", "#E8C4C4", "#C4C4E8", "#E8E8C4", "#D85A30",
];

// Uzbek names for the swatches below — without these, screen readers and
// colorblind users have no way to tell the buttons apart.
const WALL_COLOR_NAMES: Record<string, string> = {
  "#FFFFFF": "Oq",
  "#F5F0E8": "Krem",
  "#E8D5C4": "Bej",
  "#D4E8D4": "Pista yashil",
  "#C4D4E8": "Moviy",
  "#E8C4C4": "Pushti",
  "#C4C4E8": "Siren",
  "#E8E8C4": "Och sariq",
  "#D85A30": "Terrakota",
};

interface WallSectionProps {
  room: Room;
  selectedWall?: string | null;
  onWallChange?: (id: string | null) => void;
  /** Debounced PATCH to the server — owned by DesignPanel so every section
   *  shares one in-flight mutation (its pending/error state is shown once,
   *  at the panel root, regardless of which section triggered it). */
  syncToApi: (ds: DesignState) => void;
  applyWallCovering: (covering: WallCovering) => void;
  handleSetPaintColor: (color: string) => void;
  handleSetFloorType: (type: string) => void;
  renderTexturePicker: (
    intent: 'wallpaper' | 'plaster',
    onPick: (url: string) => void,
    libraryLabel: string,
  ) => React.ReactNode;
  applyWallpaper: (url: string) => void;
}

/**
 * "Bo'yoq" phase — wall/floor/ceiling target picker plus, depending on which
 * target is active: ceiling profile + settings, the full floor editor
 * (type, do'kon material, image), or wall paint/oboy/texture + the wall
 * panel generator.
 */
export function WallSection({
  room, selectedWall, onWallChange, syncToApi, applyWallCovering,
  handleSetPaintColor, handleSetFloorType, renderTexturePicker, applyWallpaper,
}: WallSectionProps) {
  const designState = useRoomStore((s) => s.designState);
  const geometry = useRoomStore((s) => s.geometry);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);
  const surfaces = useRoomStore((s) => s.surfaces);
  const applySurface = useRoomStore((s) => s.applySurface);

  const [coveringMode, setCoveringMode] = React.useState<CoveringMode>("paint");

  const targetWall: WallTarget = resolveTargetWall(selectedWall);
  const setTargetWall = (w: WallTarget) => onWallChange?.(w === 'ALL' ? null : w);
  const [selectedPattern, setSelectedPattern] = React.useState<OboyPatternId>("damask");
  const [baseColor, setBaseColor] = React.useState("#F5F0E8");
  const [accentColor, setAccentColor] = React.useState("#8B6F47");
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null);

  // Search-by-name over each do'kon strip below — debounced so typing
  // doesn't fire a request (and a React Query cache entry) per keystroke.
  const [oboyQuery, setOboyQuery] = React.useState("");
  const debouncedOboyQuery = useDebounce(oboyQuery, 300);
  const [boyoqQuery, setBoyoqQuery] = React.useState("");
  const debouncedBoyoqQuery = useDebounce(boyoqQuery, 300);

  const { data: oboyProducts = [] } = useQuery({
    queryKey: ["materials", "oboy", debouncedOboyQuery],
    queryFn: () => getMaterials({ category: "oboy", q: debouncedOboyQuery || undefined, per_page: 20 }),
    staleTime: 10 * 60 * 1000,
  });

  // Real do'kon-managed paint products, same category ("boyoq") the smeta
  // engine prices wall paint against. Picking one (below) links the wall to
  // it via applySurface so the estimate prices it exactly instead of falling
  // back to an approximate per-litre guess.
  const { data: boyoqProducts = [] } = useQuery({
    queryKey: ["materials", "boyoq", debouncedBoyoqQuery],
    queryFn: () => getMaterials({ category: "boyoq", q: debouncedBoyoqQuery || undefined, per_page: 20 }),
    staleTime: 10 * 60 * 1000,
  });

  // Sync local mode/pattern state when the selected wall changes
  React.useEffect(() => {
    const c =
      targetWall === "ALL"
        ? designState.wallCoverings.ALL
        : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL);
    if (c.kind === "paint" || c.kind === "plaster") {
      // Bare plaster is the pre-finish state — offer the paint tab, which is
      // the first thing a user does to it.
      setCoveringMode("paint");
    } else if (c.kind === "texture") {
      setCoveringMode("texture");
    } else {
      setCoveringMode("oboy");
      setSelectedPattern(c.patternId as OboyPatternId);
      setBaseColor(c.baseColor);
      setAccentColor(c.accentColor);
    }
    setSelectedProductId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetWall]);

  /** A real, priced do'kon boyoq product — links `surfaces` so the smeta
   * prices this wall exactly instead of falling back to an approximate
   * per-litre guess. */
  function handleSetPaintProduct(material: Material) {
    applyWallCovering({ kind: "paint", color: material.color_hex ?? "#D9D9D9" });
    applySurface(targetWall, material.id);
  }

  function handleSetOboy(
    patch: Partial<{ patternId: OboyPatternId; baseColor: string; accentColor: string }>,
  ) {
    const newPattern = patch.patternId ?? selectedPattern;
    const newBase = patch.baseColor ?? baseColor;
    const newAccent = patch.accentColor ?? accentColor;
    if (patch.patternId) setSelectedPattern(newPattern);
    if (patch.baseColor) setBaseColor(newBase);
    if (patch.accentColor) setAccentColor(newAccent);
    applyWallCovering({ kind: "oboy", patternId: newPattern, baseColor: newBase, accentColor: newAccent });
  }

  function handleSetCoveringMode(mode: CoveringMode) {
    setCoveringMode(mode);
    if (mode === "paint") {
      const currentColor = resolveWallColor(
        designState.wallCoverings,
        targetWall === "ALL" ? undefined : targetWall,
      );
      applyWallCovering({ kind: "paint", color: currentColor });
    } else if (mode === "texture") {
      // Don't auto-apply; wait for image upload
    } else {
      applyWallCovering({ kind: "oboy", patternId: selectedPattern, baseColor, accentColor });
    }
  }

  function updateTextureProp(patch: Partial<{ repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number }>) {
    const c = targetWall === 'ALL'
      ? designState.wallCoverings.ALL
      : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL)
    if (c.kind !== 'texture') return
    applyWallCovering({ ...c, ...patch })
  }

  const wallColorForPreview = resolveWallColor(designState.wallCoverings);
  const hasOboy = Object.values(designState.wallCoverings).some((c) => c?.kind === "oboy");

  // Which real do'kon paint product (if any) the current target wall is
  // linked to — derived from `surfaces` rather than separate local state, so
  // it stays correct across wall switches and room reloads for free.
  const currentWallSurfaceId = surfaces[targetWall] ?? surfaces["ALL"];
  const activePaintProductId = boyoqProducts.some((p) => p.id === currentWallSurfaceId)
    ? currentWallSurfaceId
    : null;

  // Server smeta is authoritative; oboySmeta.ts is instant fallback only
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ["estimate-preview", room.id, designState],
    queryFn: () => previewEstimate(room.id),
    enabled: hasOboy && !!room.id,
    staleTime: 0,
    refetchInterval: false as const,
  });

  const smeta = hasOboy ? computeOboyRolls(geometry, designState.wallCoverings, ceilingHeight) : null;

  return (
    <>
      {/* Wall + floor selector */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Devor / Pol</h3>
        <div className="flex flex-wrap gap-1.5">
          {WALL_TARGETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTargetWall(key)}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                targetWall === key
                  ? "bg-brand text-white border-brand font-semibold"
                  : "border-gray-300 text-gray-600 hover:border-brand/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Ceiling design when "Shift" is selected */}
      {targetWall === 'CEILING' && <CeilingTargetPanel syncToApi={syncToApi} />}

      {/* Floor controls when "Pol" is selected */}
      {targetWall === 'FLOOR' && <WallFloorTargetPanel handleSetFloorType={handleSetFloorType} />}

      {/* Bo'yoq / Oboy / Tekstura controls — only for actual walls. CEILING
       * has its own finish (the "Shift turi" section above, ceiling.settings.color) —
       * nothing here ever reads a 'CEILING' wallCoverings/wallPanels entry, so this
       * used to render fully-interactive paint/oboy/panel controls for the ceiling
       * that saved a value nothing displayed, while getPanelCount() below always
       * showed "0 dona" since no wall in geometry has id 'CEILING'. */}
      {targetWall !== 'FLOOR' && targetWall !== 'CEILING' && (<>
      <section className="pt-5 border-t border-gray-100">
        <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
          {(["paint", "oboy", "texture"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleSetCoveringMode(mode)}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                coveringMode === mode
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {mode === "paint" ? "Bo'yoq" : mode === "oboy" ? "Oboy" : "Rasm"}
            </button>
          ))}
        </div>
      </section>

      {/* Paint colors */}
      {coveringMode === "paint" && (
        <section className="pt-5 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.devor_rangi}</h3>
          <div className="flex flex-wrap gap-2">
            {WALL_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleSetPaintColor(color)}
                title={WALL_COLOR_NAMES[color] ?? color}
                aria-label={WALL_COLOR_NAMES[color] ?? color}
                className="w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                style={{
                  backgroundColor: color,
                  // Brand blue selection ring — was "#D85A30" (the Terrakota
                  // *palette entry* above, reused by mistake as if it were
                  // the brand accent).
                  borderColor: wallColorForPreview === color ? "#1E40AF" : "#D1D5DB",
                  boxShadow: wallColorForPreview === color ? "0 0 0 2px #1E40AF" : undefined,
                }}
                aria-pressed={wallColorForPreview === color}
              />
            ))}
          </div>

          {(boyoqProducts.length > 0 || boyoqQuery) && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Do'kondan tanlang</h3>
              <input
                type="text"
                value={boyoqQuery}
                onChange={(e) => setBoyoqQuery(e.target.value)}
                placeholder="Qidirish..."
                className="w-full px-3 py-2 mb-2 text-sm border border-gray-200 rounded-card focus:outline-none focus:border-brand transition-colors"
              />
              {boyoqProducts.length === 0 ? (
                <p className="text-xs text-gray-400">Hech narsa topilmadi</p>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {boyoqProducts.map((product: Material) => {
                      const color = product.color_hex ?? "#E5E7EB";
                      const isActive = activePaintProductId === product.id;
                      return (
                        <button
                          key={product.id}
                          title={`${product.name_uz} — ${product.price_uzs.toLocaleString("uz-UZ")} so'm/${product.unit}`}
                          onClick={() => handleSetPaintProduct(product)}
                          className="flex-shrink-0 flex flex-col items-center gap-1 w-14"
                        >
                          <div
                            className="w-12 h-12 rounded-lg border-2 transition-all"
                            style={{ backgroundColor: color, borderColor: isActive ? "#1E40AF" : "#E5E7EB", boxShadow: isActive ? "0 0 0 2px #1E40AF" : undefined }}
                          />
                          <span className="text-[10px] text-gray-500 text-center line-clamp-2 leading-tight">
                            {product.name_uz.split(" ").slice(0, 2).join(" ")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    Do'kondan tanlangan rang smetaga aniq narx bilan kiradi.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Wallpaper patterns */}
      {coveringMode === "oboy" && (
        <section className="space-y-4 pt-5 border-t border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Naqsh</h3>
            <div className="grid grid-cols-3 gap-2">
              {OBOY_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSetOboy({ patternId: p.id })}
                  className="flex flex-col items-center gap-1"
                  title={p.label}
                >
                  <svg
                    width="60"
                    height="60"
                    className="rounded-md overflow-hidden"
                    style={{ border: selectedPattern === p.id ? "2px solid #1E40AF" : "2px solid #E5E7EB" }}
                  >
                    <defs dangerouslySetInnerHTML={{ __html: getOboySvgPattern(p.id, baseColor, accentColor, `thumb-${p.id}`) }} />
                    <rect width="60" height="60" fill={`url(#thumb-${p.id})`} />
                  </svg>
                  <span className="text-xs text-gray-600">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {(oboyProducts.length > 0 || oboyQuery) && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Do'kondan tanlang</h3>
              <input
                type="text"
                value={oboyQuery}
                onChange={(e) => setOboyQuery(e.target.value)}
                placeholder="Qidirish..."
                className="w-full px-3 py-2 mb-2 text-sm border border-gray-200 rounded-card focus:outline-none focus:border-brand transition-colors"
              />
              {oboyProducts.length === 0 ? (
                <p className="text-xs text-gray-400">Hech narsa topilmadi</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                  {oboyProducts.map((product: Material) => {
                    const color = product.color_hex ?? "#E5E7EB";
                    const isActive = selectedProductId === product.id;
                    return (
                      <button
                        key={product.id}
                        title={`${product.name_uz} — ${product.price_uzs.toLocaleString("uz-UZ")} so'm/${product.unit}`}
                        onClick={() => { setSelectedProductId(product.id); handleSetOboy({ baseColor: color }); applySurface(targetWall, product.id); }}
                        className="flex-shrink-0 flex flex-col items-center gap-1 w-14"
                      >
                        <div
                          className="w-12 h-12 rounded-lg border-2 transition-all"
                          style={{ backgroundColor: color, borderColor: isActive ? "#1E40AF" : "#E5E7EB", boxShadow: isActive ? "0 0 0 2px #1E40AF" : undefined }}
                        />
                        <span className="text-[10px] text-gray-500 text-center line-clamp-2 leading-tight">
                          {product.name_uz.split(" ").slice(0, 2).join(" ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Asosiy rang</label>
              <input type="color" value={baseColor} onChange={(e) => { setSelectedProductId(null); handleSetOboy({ baseColor: e.target.value }); applySurface(targetWall, ""); }} className="w-full h-8 rounded border border-gray-200 cursor-pointer" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Naqsh rangi</label>
              <input type="color" value={accentColor} onChange={(e) => handleSetOboy({ accentColor: e.target.value })} className="w-full h-8 rounded border border-gray-200 cursor-pointer" />
            </div>
          </div>
        </section>
      )}

      {/* Texture upload */}
      {coveringMode === "texture" && (
        <section className="space-y-3 pt-5 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Devor rasmi</h3>
          {renderTexturePicker('wallpaper', applyWallpaper, 'Oboy kutubxonasi')}
          {(() => {
            const c = targetWall === "ALL"
              ? designState.wallCoverings.ALL
              : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL)
            if (c.kind !== 'texture') return null
            return (
              <div className="space-y-3">
                {/* Preview + remove */}
                <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <img src={c.url} alt="Tekstura" className="w-14 h-14 object-cover rounded-md border border-gray-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">Yuklangan rasm</p>
                    <button
                      onClick={() => applyWallCovering({ kind: 'paint', color: '#F5F0E8' })}
                      className="text-xs text-red-400 hover:text-red-600 mt-0.5"
                    >
                      O'chirish
                    </button>
                  </div>
                </div>

                {/* UVW controls */}
                <div className="space-y-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tekstura sozlamalari</p>

                  {/* Scale — value = tiles per meter; display as tile size in cm */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Masshtab X</label>
                      <span className="text-xs text-gray-400 tabular-nums">{Math.round(100 / c.repeatX)} sm</span>
                    </div>
                    <input type="range" min="0.1" max="5" step="0.05" value={c.repeatX}
                      onChange={(e) => updateTextureProp({ repeatX: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Vertikal cho'zish</label>
                      <span className="text-xs text-gray-400 tabular-nums">{c.repeatY.toFixed(2)}×</span>
                    </div>
                    <input type="range" min="0.1" max="4" step="0.05" value={c.repeatY}
                      onChange={(e) => updateTextureProp({ repeatY: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  {/* Rotation */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Burish</label>
                      <span className="text-xs text-gray-400 tabular-nums">{Math.round(c.rotation * 180 / Math.PI)}°</span>
                    </div>
                    <input type="range" min="0" max={Math.PI * 2} step={Math.PI / 36} value={c.rotation}
                      onChange={(e) => updateTextureProp({ rotation: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  {/* Offset */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Siljish X</label>
                      <span className="text-xs text-gray-400 tabular-nums">{c.offsetX.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={c.offsetX}
                      onChange={(e) => updateTextureProp({ offsetX: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Siljish Y</label>
                      <span className="text-xs text-gray-400 tabular-nums">{c.offsetY.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={c.offsetY}
                      onChange={(e) => updateTextureProp({ offsetY: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <button
                    onClick={() => updateTextureProp({ repeatX: 0.5, repeatY: 1.0, offsetX: 0, offsetY: 0, rotation: 0 })}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Standartga qaytarish
                  </button>
                </div>
              </div>
            )
          })()}
        </section>
      )}

      {/* Oboy smeta */}
      {hasOboy && (
        <section className="p-3 bg-amber-50 border border-amber-200 rounded-card">
          <h4 className="text-xs font-semibold text-amber-800 mb-1">Kerakli oboy</h4>
          {previewLoading ? (
            <p className="text-sm text-amber-700">Hisoblanmoqda...</p>
          ) : previewData ? (
            (() => {
              const oboyLines = previewData.lines.filter((l) => l.category === "oboy");
              const totalRolls = oboyLines.reduce((s, l) => s + l.quantity, 0);
              return (
                <>
                  <p className="text-sm font-bold text-amber-900">{totalRolls} rulon</p>
                  <div className="mt-2 space-y-0.5">
                    {oboyLines.map((l, i) => (
                      <p key={i} className="text-xs text-amber-700">{l.label}: {l.quantity} rulon</p>
                    ))}
                  </div>
                </>
              );
            })()
          ) : smeta && smeta.totalRolls > 0 ? (
            <>
              <p className="text-sm font-bold text-amber-900">{smeta.totalRolls} rulon (~{smeta.totalAreaM2.toFixed(1)} m²)</p>
              <div className="mt-2 space-y-0.5">
                {smeta.perWall.map((w) => (
                  <p key={w.wallId} className="text-xs text-amber-700">Devor {w.wallId}: {w.rolls} rulon ({w.areaM2.toFixed(1)} m²)</p>
                ))}
              </div>
            </>
          ) : null}
        </section>
      )}

      {/* Panel generator */}
      <WallPanelGenerator targetWall={targetWall} />
      </>)}
    </>
  );
}
