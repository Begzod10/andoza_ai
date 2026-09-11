import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMaterials, uploadWallpaper } from "@/lib/api";
import type { Material } from "@/lib/api";
import { uz } from "@/locale/uz";
import { useRoomStore } from "@/store/roomStore";
import { useDebounce } from "@/hooks/useDebounce";
import { FLOOR_TYPES } from "./shared";

const DEFAULT_FLOOR_TEX_SETTINGS = { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0, rotation: 0 };

/**
 * The full floor editor (type, do'kon material search, image + UVW) shown
 * from WallSection when the "Pol" target is selected. Distinct from the
 * standalone FloorSection (the simpler top-level "Pol" phase tab), which
 * only offers the type list.
 */
export function WallFloorTargetPanel({ handleSetFloorType }: {
  handleSetFloorType(type: string): void;
}) {
  const uvwIdBase = React.useId();
  const floorType = useRoomStore((s) => s.designState.floorType);
  const floorTexture = useRoomStore((s) => s.designState.floorTexture);
  const floorTextureSettings = useRoomStore((s) => s.designState.floorTextureSettings);
  const setDesignState = useRoomStore((s) => s.setDesignState);
  const setFloorTexture = useRoomStore((s) => s.setFloorTexture);
  const applySurface = useRoomStore((s) => s.applySurface);
  const surfaces = useRoomStore((s) => s.surfaces);
  const queryClient = useQueryClient();

  const [floorMode, setFloorMode] = React.useState<"turi" | "rasm">("turi");
  const floorFileRef = React.useRef<HTMLInputElement>(null);
  const [floorBusy, setFloorBusy] = React.useState(false);
  const [floorError, setFloorError] = React.useState<string | null>(null);
  const [floorQuery, setFloorQuery] = React.useState("");
  const debouncedFloorQuery = useDebounce(floorQuery, 300);

  // Real do'kon-managed floor covering, filtered to the category matching
  // the currently-selected floor type. "concrete" has no do'kon category —
  // a bare screed has no covering to price, so no query/picker for it.
  const FLOOR_TYPE_TO_MATERIAL_CATEGORY: Record<string, string> = {
    parquet: "parket",
    laminate: "laminat",
    tile: "plitka",
  };
  const floorMaterialCategory = FLOOR_TYPE_TO_MATERIAL_CATEGORY[floorType];
  const { data: floorProducts = [] } = useQuery({
    queryKey: ["materials", floorMaterialCategory, debouncedFloorQuery],
    queryFn: () => getMaterials({ category: floorMaterialCategory!, q: debouncedFloorQuery || undefined, per_page: 20 }),
    enabled: !!floorMaterialCategory,
    staleTime: 10 * 60 * 1000,
  });

  const activeFloorProductId = floorProducts.some((p) => p.id === surfaces.floor)
    ? surfaces.floor
    : null;

  /** A real, priced do'kon floor product — links `surfaces.floor` so the
   * smeta prices this floor exactly instead of skipping it entirely. */
  function handleSetFloorProduct(materialId: string) {
    applySurface("floor", materialId);
  }

  function updateFloorTexSettings(patch: Partial<{ repeatX: number; repeatY: number; offsetX: number; offsetY: number; rotation: number }>) {
    const current = floorTextureSettings ?? DEFAULT_FLOOR_TEX_SETTINGS;
    setDesignState({ floorTextureSettings: { ...current, ...patch } });
  }

  /**
   * Floor image upload.
   *
   * Goes to the shared media library and only the URL is kept, exactly like a
   * wall image. It used to be read straight into a data URL and stored inline
   * in the design state: a photo of any real size then either bloated every
   * save or was dropped by the draft's inline-image cap, so the floor came
   * back bare after a reload.
   *
   * If the upload cannot reach the server we still show the image from a data
   * URL, because losing the preview helps nobody — but we say plainly that it
   * will not survive a reload, instead of silently pretending it was saved.
   */
  async function handleFloorTextureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFloorError('Faqat rasm fayllari (JPG, PNG, WEBP...)');
      return;
    }
    setFloorBusy(true);
    setFloorError(null);
    setDesignState({ floorConfigured: true });
    try {
      const uploaded = await uploadWallpaper(file);
      setFloorTexture(uploaded.url);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
    } catch (err) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (url) setFloorTexture(url);
      };
      reader.readAsDataURL(file);
      setFloorError(
        `Serverga saqlanmadi${err instanceof Error && err.message ? `: ${err.message}` : ''} — ` +
        'rasm hozir ko\'rinadi, lekin sahifa yangilansa yo\'qoladi.',
      );
    } finally {
      setFloorBusy(false);
    }
  }

  return (
    <>
      {/* Turi / Rasm tabs */}
      <section>
        <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
          {(['turi', 'rasm'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFloorMode(mode)}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                floorMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {mode === 'turi' ? 'Turi' : 'Rasm'}
            </button>
          ))}
        </div>
      </section>

      {floorMode === 'turi' && (
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{uz.studio.pol_turi}</h3>
          <div className="space-y-2">
            {FLOOR_TYPES.map((ft) => (
              <button
                key={ft.key}
                onClick={() => handleSetFloorType(ft.key)}
                className={`w-full text-left px-3 py-2.5 rounded-card text-sm border-2 transition-colors ${
                  floorType === ft.key
                    ? "border-brand bg-brand/10 text-brand font-semibold"
                    : "border-gray-200 hover:border-brand/40 text-gray-700"
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>

          {floorMaterialCategory && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Do'kondan tanlang</h3>
              <input
                type="text"
                value={floorQuery}
                onChange={(e) => setFloorQuery(e.target.value)}
                placeholder="Qidirish..."
                className="w-full px-3 py-2 mb-2 text-sm border border-gray-200 rounded-card focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 transition-colors"
              />
              {floorProducts.length === 0 ? (
                <p className="text-xs text-gray-500">
                  {floorQuery ? "Hech narsa topilmadi" : "Hozircha do'konda bu turdagi pol materiali yo'q — smeta bu pol uchun narx hisoblamaydi."}
                </p>
              ) : (
                <>
                  <div className="flex flex-col gap-2" role="listbox" aria-label="Pol materiali">
                    {floorProducts.map((product: Material) => {
                      const isActive = activeFloorProductId === product.id;
                      return (
                        <button
                          key={product.id}
                          onClick={() => handleSetFloorProduct(product.id)}
                          role="option"
                          aria-selected={isActive}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-card text-left border-2 transition-colors ${
                            isActive ? "border-brand bg-brand/10" : "border-gray-200 hover:border-brand/40"
                          }`}
                        >
                          <div
                            className="w-9 h-9 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: product.color_hex ?? "#D8D3C8" }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{product.name_uz}</p>
                            <p className="text-xs text-muted">{product.price_uzs.toLocaleString("uz-UZ")} so'm/{product.unit}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Do'kondan tanlangan pol materiali smetaga aniq narx bilan kiradi.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {floorMode === 'rasm' && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Pol rasmi</h3>
          <input
            ref={floorFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFloorTextureUpload}
          />
          <button
            onClick={() => { setFloorError(null); floorFileRef.current?.click(); }}
            disabled={floorBusy}
            className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-brand/50 hover:text-brand transition-colors disabled:opacity-50"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="M21 15l-5-5L5 21"/>
            </svg>
            <span className="text-sm font-medium">{floorBusy ? 'Yuklanmoqda…' : 'Rasm yuklash'}</span>
            <span className="text-xs text-gray-500">JPG, PNG, WEBP · 15 MB gacha</span>
          </button>
          {floorError && <p className="text-xs text-amber-600 leading-snug">{floorError}</p>}
          {floorTexture && (() => {
            const fs = floorTextureSettings ?? DEFAULT_FLOOR_TEX_SETTINGS;
            return (
              <>
                <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <img src={floorTexture} alt="Pol teksturasi" className="w-14 h-14 object-cover rounded-md border border-gray-200 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">Yuklangan rasm</p>
                    <button
                      onClick={() => setFloorTexture(null)}
                      className="text-xs text-red-400 hover:text-red-600 mt-0.5"
                    >
                      O'chirish
                    </button>
                  </div>
                </div>

                {/* UVW controls */}
                <div className="space-y-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Tekstura sozlamalari</p>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label htmlFor={`${uvwIdBase}-scale-x`} className="text-xs text-gray-600 font-medium">Masshtab X</label>
                      <span className="text-xs text-gray-500 tabular-nums">{(1 / fs.repeatX).toFixed(2)} m</span>
                    </div>
                    <input id={`${uvwIdBase}-scale-x`} type="range" min="0.1" max="5" step="0.05" value={fs.repeatX}
                      onChange={(e) => updateFloorTexSettings({ repeatX: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label htmlFor={`${uvwIdBase}-scale-y`} className="text-xs text-gray-600 font-medium">Masshtab Y</label>
                      <span className="text-xs text-gray-500 tabular-nums">{(1 / fs.repeatY).toFixed(2)} m</span>
                    </div>
                    <input id={`${uvwIdBase}-scale-y`} type="range" min="0.1" max="5" step="0.05" value={fs.repeatY}
                      onChange={(e) => updateFloorTexSettings({ repeatY: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label htmlFor={`${uvwIdBase}-rotation`} className="text-xs text-gray-600 font-medium">Burish</label>
                      <span className="text-xs text-gray-500 tabular-nums">{Math.round(fs.rotation * 180 / Math.PI)}°</span>
                    </div>
                    <input id={`${uvwIdBase}-rotation`} type="range" min="0" max={Math.PI * 2} step={Math.PI / 36} value={fs.rotation}
                      onChange={(e) => updateFloorTexSettings({ rotation: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label htmlFor={`${uvwIdBase}-offset-x`} className="text-xs text-gray-600 font-medium">Siljish X</label>
                      <span className="text-xs text-gray-500 tabular-nums">{fs.offsetX.toFixed(2)}</span>
                    </div>
                    <input id={`${uvwIdBase}-offset-x`} type="range" min="0" max="1" step="0.01" value={fs.offsetX}
                      onChange={(e) => updateFloorTexSettings({ offsetX: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label htmlFor={`${uvwIdBase}-offset-y`} className="text-xs text-gray-600 font-medium">Siljish Y</label>
                      <span className="text-xs text-gray-500 tabular-nums">{fs.offsetY.toFixed(2)}</span>
                    </div>
                    <input id={`${uvwIdBase}-offset-y`} type="range" min="0" max="1" step="0.01" value={fs.offsetY}
                      onChange={(e) => updateFloorTexSettings({ offsetY: parseFloat(e.target.value) })}
                      className="w-full accent-brand h-1.5" />
                  </div>

                  <button
                    onClick={() => setDesignState({ floorTextureSettings: DEFAULT_FLOOR_TEX_SETTINGS })}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Standartga qaytarish
                  </button>
                </div>
              </>
            );
          })()}
        </section>
      )}
    </>
  );
}
