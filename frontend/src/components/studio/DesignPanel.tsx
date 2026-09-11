import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  updateRoom, listWallpapers, uploadWallpaper, deleteWallpaper,
} from "@/lib/api";
import type { Room, Wallpaper, WallpaperKind } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { uz } from "@/locale/uz";
import { useRoomStore, DEFAULT_DESIGN_STATE } from "@/store/roomStore";
import type { WallCovering, FloorType, DesignState } from "@/store/roomStore";
import { LightPanel } from "@/components/studio/LightPanel";
import type { LightTypeId } from "@/lib/lightCatalog";
import { PLASTER_FINISHES, plasterRepeat } from "@/lib/plasterFinishes";
import { useRestoreUserModels } from "@/hooks/useRestoreUserModels";

import type { PhaseKey } from "@/lib/phases";
import { resolveTargetWall } from "./design-panel/shared";
import { WallSection } from "./design-panel/WallSection";
import { FloorSection } from "./design-panel/FloorSection";
import { MebelSection } from "./design-panel/MebelSection";
import { SuvoqSection } from "./design-panel/SuvoqSection";
import { MontajSection } from "./design-panel/MontajSection";

export function DesignPanel({ room, phase, selectedWall, onWallChange, selectedLightId, onLightChange, armedLightType, onArmLight, planMode }: {
  room: Room;
  phase: PhaseKey;
  selectedWall?: string | null;
  onWallChange?: (id: string | null) => void;
  /** Light selected in the 3D viewport — keeps the panel and the scene in sync. */
  selectedLightId?: string | null;
  onLightChange?: (id: string | null) => void;
  /** Fixture armed for click-to-place in the 2D lighting plan. */
  armedLightType?: LightTypeId | null;
  onArmLight?: (id: LightTypeId | null) => void;
  /** A 2D plan is on screen, so the palette arms rather than auto-places. */
  planMode?: boolean;
}) {
  useRestoreUserModels()

  const designState = useRoomStore((s) => s.designState);
  const setDesignState = useRoomStore((s) => s.setDesignState);
  const setWallCovering = useRoomStore((s) => s.setWallCovering);
  const setFloorTexture = useRoomStore((s) => s.setFloorTexture);
  const resetDesignState = useRoomStore((s) => s.resetDesignState);
  const geometry = useRoomStore((s) => s.geometry);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);
  const surfaces = useRoomStore((s) => s.surfaces);
  const applySurface = useRoomStore((s) => s.applySurface);

  // Which wall/floor/ceiling target the wall- and plaster-covering actions
  // below apply to — the same derivation WallSection and SuvoqSection use
  // internally for their own rendering, driven by the same `selectedWall`
  // prop, so all three always agree on "the" active target.
  const targetWall = resolveTargetWall(selectedWall);

  const mutation = useMutation({
    mutationFn: (data: { design_state: Record<string, unknown>; surfaces?: Record<string, unknown> }) =>
      updateRoom(room.id, data),
  });

  const syncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // surfacesRef always holds the latest store value so a debounced sync
  // fired from a design-state change still PATCHes the surfaces picked in
  // between — surfaces itself isn't a syncToApi(ds) argument.
  const surfacesRef = React.useRef(surfaces);
  surfacesRef.current = surfaces;
  function syncToApi(ds: DesignState) {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      mutation.mutate({
        surfaces: surfacesRef.current,
        design_state: {
          wallCoverings: ds.wallCoverings,
          floorType: ds.floorType,
          ceiling: ds.ceiling,
        },
      });
    }, 600);
  }

  // Reset button: click-to-arm, click-to-confirm — see the render below.
  const [resetArmed, setResetArmed] = React.useState(false);
  const resetArmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current) }, []);
  function armReset() {
    setResetArmed(true);
    if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
    // Auto-disarm — a confirm row primed from a tap ten minutes ago and then
    // rediscovered is more dangerous than no confirm step at all.
    resetArmTimerRef.current = setTimeout(() => setResetArmed(false), 5000);
  }
  function cancelReset() {
    setResetArmed(false);
    if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
  }
  function confirmReset() {
    setResetArmed(false);
    if (resetArmTimerRef.current) clearTimeout(resetArmTimerRef.current);
    resetDesignState();
    mutation.mutate({ design_state: { wallCoverings: DEFAULT_DESIGN_STATE.wallCoverings, floorType: DEFAULT_DESIGN_STATE.floorType } });
  }

  function applyWallCovering(covering: WallCovering) {
    setWallCovering(targetWall, covering);
    const updated = {
      wallCoverings: { ...designState.wallCoverings, [targetWall]: covering },
      floorType: designState.floorType,
    };
    syncToApi({ ...designState, ...updated });
  }

  function handleSetPaintColor(color: string) {
    applyWallCovering({ kind: "paint", color });
    // A plain swatch has no do'kon material behind it — clear any earlier
    // link so the smeta doesn't keep pricing this wall against a product
    // the user just moved away from.
    applySurface(targetWall, "");
  }

  function handleSetFloorType(type: string) {
    const ft = type as FloorType;
    setDesignState({ floorType: ft, floorConfigured: true });
    setFloorTexture(null);
    syncToApi({ ...designState, floorType: ft, floorConfigured: true, floorTexture: null });
    // Switching category invalidates any material picked for the old one
    // (e.g. a laminate product doesn't belong on a "tile" floor) — clear it
    // rather than leave the smeta pricing the new floor against it.
    applySurface("floor", "");
  }

  // ─── Wallpaper library ──────────────────────────────────────────────────────
  //
  // Uploads go to the server, not into the design state. A data URL used to be
  // stored inline, which meant the image was gone after a reload (and nobody
  // else could use it). Now the covering only carries the library URL, so a
  // saved room reloads with its wallpaper and every user sees the same shelf.

  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.is_admin === true;
  const { data: wallpapers = [] } = useQuery<Wallpaper[]>({
    queryKey: ["wallpapers"],
    queryFn: () => listWallpapers(),
    staleTime: 60_000,
  });
  // The suvoq/shpaklovka shelf is its own library: a bare-wall photo is no use
  // in the oboy picker and vice versa, so those phases list only the images
  // uploaded from them (`kind`-filtered server-side).
  const surfaceKind: WallpaperKind = phase === 'shpaklovka' ? 'shpaklovka' : 'suvoq';
  const { data: surfaceTextures = [] } = useQuery<Wallpaper[]>({
    queryKey: ["wallpapers", surfaceKind],
    queryFn: () => listWallpapers({ kind: surfaceKind }),
    staleTime: 60_000,
  });
  const [wallpaperBusy, setWallpaperBusy] = React.useState(false);
  const [wallpaperError, setWallpaperError] = React.useState<string | null>(null);

  function applyWallpaper(url: string) {
    applyWallCovering({ kind: 'texture', url, color: '#ffffff', repeatX: 0.5, repeatY: 1.0, offsetX: 0, offsetY: 0, rotation: 0 });
  }

  // One picker for every phase that uploads a wall image.
  //
  // The input is mounted at the panel root, not inside a section: it used to
  // live inside the Bo'yoq section behind a mode check, so from Suvoq the ref
  // was null and pressing the upload button did nothing at all, silently.
  // `pickerIntent` records which button opened it, since a plaster photo and a
  // wallpaper roll want different tiling.
  const textureFileRef = React.useRef<HTMLInputElement>(null);
  const pickerIntent = React.useRef<'wallpaper' | 'plaster'>('wallpaper');

  function openTexturePicker(intent: 'wallpaper' | 'plaster') {
    pickerIntent.current = intent;
    setWallpaperError(null);
    textureFileRef.current?.click();
  }

  /** Wall-sized tiling for an uploaded plaster/concrete photo. */
  function plasterUploadCovering(url: string): WallCovering {
    const wallW = (geometry.walls.find((w) => w.id === 'A')?.length ?? 4000) / 1000;
    const wallH = ceilingHeight > 0 ? ceilingHeight : 2.7;
    // Treat an uploaded plaster shot as roughly a 2.4 m patch, matching the
    // generated finishes — a wallpaper's 0.5 × 1.0 repeat looks like tiling.
    const { repeatX, repeatY } = plasterRepeat(
      { ...PLASTER_FINISHES[0], tileM: 2.4 },
      wallW,
      wallH,
    );
    return { kind: 'texture', url, color: '#ffffff', repeatX, repeatY, offsetX: 0, offsetY: 0, rotation: 0 };
  }

  /**
   * Upload drop-zone plus the shared image library.
   *
   * Rendered identically wherever a wall image can be chosen — the Bo'yoq
   * "Rasm" tab and the Suvoq finishes — so the two phases don't drift into
   * offering the same capability through different-looking controls. `onPick`
   * decides how the chosen image is applied, which is the only real
   * difference: a wallpaper roll and a plaster patch tile differently.
   */
  function renderTexturePicker(
    intent: 'wallpaper' | 'plaster',
    onPick: (url: string) => void,
    libraryLabel: string,
    // Which shelf to show — the oboy library by default, the phase's own
    // kind-filtered one where the caller passes it (Suvoq/Shpaklovka).
    library: Wallpaper[] = wallpapers,
  ) {
    const active = targetWall === "ALL"
      ? designState.wallCoverings.ALL
      : (designState.wallCoverings[targetWall] ?? designState.wallCoverings.ALL);
    const activeUrl = active.kind === 'texture' ? active.url : null;
    return (
      <>
        <button
          onClick={() => openTexturePicker(intent)}
          disabled={wallpaperBusy}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-brand/50 hover:text-brand transition-colors disabled:opacity-50"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
          <span className="text-sm font-medium">
            {wallpaperBusy ? 'Yuklanmoqda…' : 'Rasm yuklash'}
          </span>
          <span className="text-xs text-gray-500">JPG, PNG, WEBP · 15 MB gacha</span>
        </button>
        {wallpaperError && <p className="text-xs text-red-500">{wallpaperError}</p>}

        {/* Shared library — uploaded once, stays for everyone */}
        {library.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{libraryLabel}</p>
              <span className="text-[10px] text-gray-500">{library.length} ta</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {library.map((w) => (
                <div key={w.id} className="relative">
                  <button
                    onClick={() => onPick(w.url)}
                    title={w.name}
                    className={`block w-full aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                      activeUrl === w.url ? 'border-brand' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <img src={w.url} alt={w.name} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                  {isAdmin && (
                    // w-11 h-11 (44px) invisible hit area centered on the same
                    // visual spot the old w-5 h-5 circle occupied — enlarging
                    // the circle itself would swallow a chunk of a 3-column
                    // thumbnail grid, so only the tappable area grows.
                    <button
                      onClick={() => handleWallpaperDelete(w)}
                      title="Kutubxonadan o'chirish"
                      aria-label="Kutubxonadan o'chirish"
                      className="absolute -top-[18px] -right-[18px] w-11 h-11 flex items-center justify-center text-gray-400 hover:text-red-500"
                    >
                      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow text-[10px] leading-none">
                        ✕
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] leading-4 text-gray-500">
              Yuklangan rasmlar hamma foydalanuvchilar uchun saqlanadi
              {isAdmin ? '.' : "; ularni faqat administrator o'chira oladi."}
            </p>
          </div>
        )}
      </>
    );
  }

  async function handleTextureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setWallpaperError('Faqat rasm fayllari (JPG, PNG, WEBP...)');
      return;
    }
    const intent = pickerIntent.current;
    setWallpaperBusy(true);
    setWallpaperError(null);
    try {
      // A plaster/shpaklovka photo lands on that phase's shelf; a wallpaper
      // roll on the shared oboy one.
      const wallpaper = await uploadWallpaper(file, {
        kind: intent === 'plaster' ? surfaceKind : 'oboy',
      });
      if (intent === 'plaster') applyWallCovering(plasterUploadCovering(wallpaper.url));
      else applyWallpaper(wallpaper.url);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
    } catch (err) {
      setWallpaperError(
        err instanceof Error && err.message
          ? `Rasmni yuklab bo'lmadi: ${err.message}`
          : "Rasmni yuklab bo'lmadi. Qaytadan urinib ko'ring.",
      );
    } finally {
      setWallpaperBusy(false);
    }
  }

  async function handleWallpaperDelete(wallpaper: Wallpaper) {
    // Shared and permanent: removing one takes it away from every user, and
    // any room already painted with it loses the image.
    if (!window.confirm(`"${wallpaper.name}" hamma foydalanuvchilar uchun o'chirilsinmi?`)) return;
    setWallpaperError(null);
    try {
      await deleteWallpaper(wallpaper.id);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
    } catch {
      setWallpaperError("O'chirib bo'lmadi.");
    }
  }

  return (
    // lg:self-start + lg:max-h-full (not lg:h-full): the panel hugs its own
    // content height instead of stretching to match the canvas column's full
    // height, which used to leave a large empty gap below the color swatches
    // whenever the active phase's content was short. Still scrolls (overflow
    // -y-auto + max-h-full) if content ever grows past the viewport.
    <aside className="w-full lg:w-72 lg:shrink-0 lg:self-start bg-surface border-l border-gray-200 overflow-y-auto lg:max-h-full">
      {/* Mounted at the root so every phase's upload button can reach it */}
      <input
        ref={textureFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleTextureUpload}
      />
      <div className="p-4 space-y-5">

        {phase === 'boyoq' && (
          <WallSection
            room={room}
            selectedWall={selectedWall}
            onWallChange={onWallChange}
            syncToApi={syncToApi}
            applyWallCovering={applyWallCovering}
            handleSetPaintColor={handleSetPaintColor}
            handleSetFloorType={handleSetFloorType}
            renderTexturePicker={renderTexturePicker}
            applyWallpaper={applyWallpaper}
          />
        )}
        {phase === 'pol' && <FloorSection onSetFloorType={handleSetFloorType} />}
        {phase === 'mebel' && <MebelSection />}
        {phase === 'chiroq' && (
          <LightPanel selectedId={selectedLightId} onSelect={onLightChange}
            armedType={armedLightType} onArm={onArmLight} planMode={planMode} />
        )}
        {(phase === 'suvoq' || phase === 'shpaklovka') && (
          <SuvoqSection
            selectedWall={selectedWall}
            onWallChange={onWallChange}
            applyWallCovering={applyWallCovering}
            handleSetPaintColor={handleSetPaintColor}
            // Bound to the phase's own kind-filtered shelf, so a suvoq photo
            // never shows up when picking oboy and vice versa.
            renderTexturePicker={(intent, onPick, label) =>
              renderTexturePicker(intent, onPick, label, surfaceTextures)}
            plasterUploadCovering={plasterUploadCovering}
          />
        )}
        {phase === 'montaj' && <MontajSection />}

        {mutation.isPending && (
          <p className="text-xs text-muted animate-pulse">{uz.common.saqlash}...</p>
        )}
        {mutation.isError && (
          <p className="text-xs text-amber-600">Oflayn rejimda — o'zgarishlar saqlandi</p>
        )}

        {/* Reset button — separated with its own divider from whatever setting
            sits above (color swatches, panels, etc.) so it never reads as part
            of that selection. Destructive, so a single tap can't fire it: the
            first click only arms an inline confirm row (auto-disarms after a
            few seconds so a stray tap doesn't leave it primed indefinitely);
            the action only runs on the explicit second tap. */}
        <div className="mt-8 pt-4 border-t border-gray-200">
          {!resetArmed ? (
            <button
              onClick={armReset}
              className="w-full px-4 py-2.5 text-sm font-semibold text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors"
            >
              🔄 Dizaynni Bekor Qilish
            </button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-red-700">
                Ishonchingiz komilmi? Barcha dizayn o'zgarishlari o'chiriladi.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={cancelReset}
                  className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={confirmReset}
                  className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Ha, o'chirish
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
