import type * as React from "react";
import { useRoomStore } from "@/store/roomStore";
import type { WallCovering } from "@/store/roomStore";
import { PLASTER_FINISHES, plasterTextureUrl, plasterRepeat } from "@/lib/plasterFinishes";
import type { PlasterFinish } from "@/lib/plasterFinishes";
import { WALL_TARGETS, resolveTargetWall, type WallTarget } from "./shared";

interface SuvoqSectionProps {
  selectedWall?: string | null;
  onWallChange?: (id: string | null) => void;
  applyWallCovering: (covering: WallCovering) => void;
  handleSetPaintColor: (color: string) => void;
  renderTexturePicker: (
    intent: 'wallpaper' | 'plaster',
    onPick: (url: string) => void,
    libraryLabel: string,
  ) => React.ReactNode;
  plasterUploadCovering: (url: string) => WallCovering;
}

/**
 * "Suvoq" / "Shpaklovka" phase — bare concrete / plaster finishes.
 *
 * Applies through the normal wall-covering path, so the finish is part of
 * the room's design state and is what the 3D viewport paints. The finishes
 * are generated as SVG data URLs, which means the wall keeps its surface
 * after a reload without depending on an uploaded file still being fetchable.
 */
export function SuvoqSection({
  selectedWall, onWallChange, applyWallCovering, handleSetPaintColor,
  renderTexturePicker, plasterUploadCovering,
}: SuvoqSectionProps) {
  const wallCoverings = useRoomStore((s) => s.designState.wallCoverings);
  const geometry = useRoomStore((s) => s.geometry);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);

  const targetWall: WallTarget = resolveTargetWall(selectedWall);
  const setTargetWall = (w: WallTarget) => onWallChange?.(w === 'ALL' ? null : w);

  const currentCoveringUrl = (() => {
    const c = targetWall === 'ALL' ? wallCoverings.ALL : (wallCoverings[targetWall] ?? wallCoverings.ALL);
    return c.kind === 'texture' ? c.url : null;
  })();

  function applyPlaster(finish: PlasterFinish) {
    const wallW = (geometry.walls.find((w) => w.id === 'A')?.length ?? 4000) / 1000;
    const wallH = ceilingHeight > 0 ? ceilingHeight : 2.7;
    const { repeatX, repeatY } = plasterRepeat(finish, wallW, wallH);
    applyWallCovering({
      kind: 'texture',
      url: plasterTextureUrl(finish),
      color: '#ffffff',
      repeatX,
      repeatY,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Suvoq / Beton</h3>
        <p className="text-[11px] text-gray-400 leading-snug">
          Devor yuzasini tanlang. Tanlov saqlanadi va sahifa yangilangandan keyin ham qoladi.
        </p>
      </div>

      {/* Which wall the finish lands on */}
      <div>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
          Qaysi devorga
        </span>
        <div className="flex flex-wrap gap-1">
          {WALL_TARGETS.filter((w) => w.key !== 'FLOOR').map((w) => (
            <button
              key={w.key}
              onClick={() => setTargetWall(w.key)}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border-2 transition-colors ${
                targetWall === w.key
                  ? 'border-brand bg-brand text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* The finishes */}
      <div>
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1.5">
          Beton teksturasi
        </span>
        <div className="grid grid-cols-2 gap-2">
          {PLASTER_FINISHES.map((f) => {
            const url = plasterTextureUrl(f);
            const active = currentCoveringUrl === url;
            return (
              <button
                key={f.id}
                onClick={() => applyPlaster(f)}
                title={f.hint}
                className={`rounded-xl border-2 overflow-hidden text-left transition-all ${
                  active ? 'border-brand ring-2 ring-brand/25' : 'border-gray-200 hover:border-brand/50'
                }`}
              >
                <span
                  className="block h-12 w-full"
                  style={{ backgroundImage: `url("${url}")`, backgroundSize: '120px 120px' }}
                />
                <span className="block px-1.5 py-1 text-[11px] font-semibold text-gray-800 bg-white">
                  {f.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Own image — goes to the shared library so the URL keeps resolving */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Suvoq rasmi</h3>
        {renderTexturePicker(
          'plaster',
          (url) => applyWallCovering(plasterUploadCovering(url)),
          'Rasm kutubxonasi',
        )}
      </div>

      <button
        onClick={() => handleSetPaintColor('#D8D3C8')}
        className="w-full py-1.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-500 hover:text-gray-700"
      >
        Teksturani olib tashlash
      </button>
    </section>
  );
}
