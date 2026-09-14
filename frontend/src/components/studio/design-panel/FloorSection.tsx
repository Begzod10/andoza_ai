import { useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadWallpaper } from "@/lib/api";
import { useRoomStore } from "@/store/roomStore";
import { uz } from "@/locale/uz";
import { FLOOR_TYPES } from "./shared";

/**
 * "Pol" phase — the floor-type picker plus a custom floor-image upload.
 * (The full-featured floor editor, with do'kon material search and UVW
 * controls, lives inside WallSection's own "Pol" wall-target — this stays the
 * simpler top-level phase tab, now with the same image upload.)
 */
export function FloorSection({ onSetFloorType }: {
  onSetFloorType(type: string): void;
}) {
  const floorType = useRoomStore((s) => s.designState.floorType);
  const floorTexture = useRoomStore((s) => s.designState.floorTexture);
  const setFloorTexture = useRoomStore((s) => s.setFloorTexture);
  const setDesignState = useRoomStore((s) => s.setDesignState);
  const queryClient = useQueryClient();

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
    setDesignState({ floorConfigured: true });
    try {
      const uploaded = await uploadWallpaper(file, { kind: "pol" });
      setFloorTexture(uploaded.url);
      queryClient.invalidateQueries({ queryKey: ["wallpapers", "pol"] });
    } catch (err) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        if (url) setFloorTexture(url);
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

      {/* Custom floor image upload */}
      <div className="mt-4 space-y-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">O'z rasmingiz</h3>
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
        {floorTexture && (
          <div className="flex items-center gap-2">
            <img src={floorTexture} alt="Pol rasmi" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
            <span className="flex-1 text-xs text-gray-600">Rasm qo'llandi</span>
            <button
              onClick={() => setFloorTexture(null)}
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
