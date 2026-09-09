import * as React from "react";
import { useRoomStore, resolveWallPanel } from "@/store/roomStore";
import type { WallPanelSettings } from "@/store/roomStore";
import type { WallTarget } from "./shared";

function PanelInput({
  label, valueMm, minMm, maxMm, onCommit,
}: {
  label: string;
  valueMm: number;
  minMm: number;
  maxMm: number;
  onCommit: (mm: number) => void;
}) {
  const displayMm = String(valueMm);
  const [draft, setDraft] = React.useState<string | null>(null);
  const showing = draft ?? displayMm;

  function commit() {
    if (draft === null) return;
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed >= minMm && parsed <= maxMm) {
      onCommit(Math.round(parsed));
    }
    setDraft(null);
  }

  const draftVal = draft !== null ? parseFloat(draft) : NaN;
  const isInvalid = draft !== null && (isNaN(draftVal) || draftVal < minMm || draftVal > maxMm);

  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={showing}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => { setDraft(displayMm); e.currentTarget.select(); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className={`w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none transition-colors ${
          isInvalid ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-brand'
        }`}
      />
      {draft !== null && !isNaN(draftVal) && draftVal < minMm && (
        <p className="text-[10px] text-red-500 mt-0.5">Min: {minMm} mm</p>
      )}
    </div>
  );
}

const DEFAULT_PANEL: WallPanelSettings = {
  enabled: false, width: 300, height: 600, depth: 20, rotation: 0, gap: 10, chamfer: 0, color: '#D4C5B0',
};

// B/D walls own the corners so their rendered length = inner + 2×T (T=250mm)
function renderLengthMm(w: { id: string; length: number }): number {
  return (w.id === 'B' || w.id === 'D') ? w.length + 500 : w.length;
}

/**
 * Decorative wall-panel generator — shown from WallSection for any actual
 * wall target (not FLOOR/CEILING). `targetWall` decides which wall(s) the
 * settings and the panel count below apply to.
 */
export function WallPanelGenerator({ targetWall }: { targetWall: WallTarget }) {
  const wallPanels = useRoomStore((s) => s.designState.wallPanels);
  const setWallPanel = useRoomStore((s) => s.setWallPanel);
  const geometry = useRoomStore((s) => s.geometry);
  const ceilingHeight = useRoomStore((s) => s.ceilingHeight);

  const panelSettings = resolveWallPanel(
    wallPanels,
    targetWall === 'ALL' ? undefined : targetWall as 'A' | 'B' | 'C' | 'D',
  ) ?? DEFAULT_PANEL;

  function handlePanelChange(patch: Partial<WallPanelSettings>) {
    setWallPanel(targetWall, { ...panelSettings, ...patch });
  }

  function getPanelCount(): number {
    if (!panelSettings.enabled) return 0;
    const refWalls = targetWall === 'ALL'
      ? geometry.walls
      : geometry.walls.filter((w) => w.id === targetWall);
    const avgLengthMm = refWalls.reduce((s, w) => s + renderLengthMm(w), 0) / (refWalls.length || 1);
    const pw = panelSettings.rotation === 90 ? panelSettings.height : panelSettings.width;
    const ph = panelSettings.rotation === 90 ? panelSettings.width : panelSettings.height;
    const stride = pw + panelSettings.gap;
    if (stride <= 0 || pw <= 0 || ph <= 0) return 0;
    const cols = avgLengthMm > 0 ? Math.ceil(avgLengthMm / stride) : 0;
    const rowStride = ph + panelSettings.gap;
    const rows = (ceilingHeight > 0 && rowStride > 0) ? Math.max(1, Math.floor((ceilingHeight - ph / 2) / rowStride) + 1) : 0;
    return cols * rows;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Devor panellari</h3>
        <button
          onClick={() => handlePanelChange({ enabled: !panelSettings.enabled })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
            panelSettings.enabled ? 'bg-brand' : 'bg-gray-200'
          }`}
          aria-checked={panelSettings.enabled}
          role="switch"
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              panelSettings.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {panelSettings.enabled && (
        <div className="space-y-3">
          {/* Width & Height */}
          <div className="grid grid-cols-2 gap-2">
            <PanelInput
              label="Kenglik (mm)"
              valueMm={panelSettings.width}
              minMm={10}
              maxMm={2000}
              onCommit={(mm) => handlePanelChange({ width: mm })}
            />
            <PanelInput
              label="Balandlik (mm)"
              valueMm={panelSettings.height}
              minMm={10}
              maxMm={4000}
              onCommit={(mm) => handlePanelChange({ height: mm })}
            />
          </div>

          {/* Depth & Gap */}
          <div className="grid grid-cols-2 gap-2">
            <PanelInput
              label="Qalinlik (mm)"
              valueMm={panelSettings.depth}
              minMm={4}
              maxMm={200}
              onCommit={(mm) => handlePanelChange({ depth: mm })}
            />
            <PanelInput
              label="Oraliq (mm)"
              valueMm={panelSettings.gap}
              minMm={1}
              maxMm={500}
              onCommit={(mm) => handlePanelChange({ gap: mm })}
            />
          </div>

          {/* Orientation */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Joylashuv</label>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
              {([0, 90] as const).map((angle) => (
                <button
                  key={angle}
                  onClick={() => handlePanelChange({ rotation: angle })}
                  className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                    panelSettings.rotation === angle
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {angle === 0 ? 'Vertikal' : 'Gorizontal'}
                </button>
              ))}
            </div>
          </div>

          {/* Chamfer */}
          <PanelInput
            label="Chamfer (mm)"
            valueMm={panelSettings.chamfer ?? 0}
            minMm={0}
            maxMm={200}
            onCommit={(mm) => handlePanelChange({ chamfer: mm })}
          />

          {/* Color */}
          <div>
            <label className="text-xs text-gray-500 block mb-1">Panel rangi</label>
            <input
              type="color"
              value={panelSettings.color}
              onChange={(e) => handlePanelChange({ color: e.target.value })}
              className="w-full h-8 rounded border border-gray-200 cursor-pointer"
            />
          </div>

          {/* Panel count */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 mb-0.5">Bir devordagi panel soni</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight">
              {getPanelCount()}
              <span className="text-sm font-normal text-gray-400 ml-1">dona</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {(() => {
                const refWalls = targetWall === 'ALL' ? geometry.walls : geometry.walls.filter(w => w.id === targetWall);
                const avgMm = refWalls.reduce((s, w) => s + renderLengthMm(w), 0) / (refWalls.length || 1);
                const pw = panelSettings.rotation === 90 ? panelSettings.height : panelSettings.width;
                const ph = panelSettings.rotation === 90 ? panelSettings.width : panelSettings.height;
                const stride = pw + panelSettings.gap;
                const cols = stride > 0 && avgMm > 0 ? Math.ceil(avgMm / stride) : 0;
                const rowStride2 = ph + panelSettings.gap;
                const rows = ph > 0 && ceilingHeight > 0 && rowStride2 > 0 ? Math.max(1, Math.floor((ceilingHeight - ph / 2) / rowStride2) + 1) : 0;
                return `${cols} ustun × ${rows} qator`;
              })()}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
