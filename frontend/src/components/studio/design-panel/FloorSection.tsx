import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listWallpapers, uploadWallpaper } from "@/lib/api";
import type { FloorPatternSettings } from "@/lib/floorGeometry";
import { useRoomStore } from "@/store/roomStore";
import { uz } from "@/locale/uz";
import { FLOOR_TYPES } from "./shared";
import { FloorPatternGroup, SkirtingGroup } from "./FloorControls";

/**
 * "Pol" phase — the floor-type picker, the laying pattern (Naqsh) and
 * skirting (Plintus) shared with the Bo'yoq panel's "Pol" target (see
 * FloorControls.tsx), plus the floor-image library and a custom upload.
 * (Do'kon material search and the whole-floor UVW map are the extras that
 * stay in WallSection's own "Pol" wall-target.)
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

      {/* Naqsh + Plintus — shared with the Bo'yoq panel's "Pol" target so
          the floor offers the same controls wherever it is edited. */}
      <FloorPatternGroup />

      <SkirtingGroup />

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

