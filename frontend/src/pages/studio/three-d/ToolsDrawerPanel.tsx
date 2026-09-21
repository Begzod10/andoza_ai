import type { Dispatch, SetStateAction } from "react";
import { Wrench } from "lucide-react";
import { createPortal } from "react-dom";
import { TopDrawer, TopDrawerButton } from "@/components/ui/TopDrawer";
import { useRoomStore, type PlacedFurniture } from "@/store/roomStore";
import type { ToolMode } from "@/features/studio/StudioFurniture";
import { RENO_STAGES } from "@/lib/phases";
import { uz } from "@/locale/uz";
import { formatClock } from "./helpers";

/**
 * The studio's collapsed "Asboblar" toolbar drawer: tool modes, undo/redo,
 * view controls (help/recenter/screenshot/scan toggle), lighting (day-night
 * + sun clock + room lights), the AI-builder entry point, and the mobile
 * design-panel toggle. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 */
export function ToolsDrawerPanel({
  toolbarSlot, toolbarSlotTop, toolsDrawerOpen, setToolsDrawerOpen,
  activeIdx,
  toolMode, setToolMode,
  selectedFurId, furniture, angleInputDeg, setAngleInputDeg, moveFurniture,
  canUndo, canRedo,
  setShowHelp,
  setPresetVersion,
  screenshotStatus, handleScreenshot,
  hasScan, showScan, setShowScan,
  sceneLightOn, setSceneLightOn,
  lightsOn, setLightsOn,
  sunHour, setSunHour,
  setShowAiSheet,
  setShowPanel,
}: {
  toolbarSlot?: HTMLDivElement | null;
  toolbarSlotTop?: number;
  toolsDrawerOpen: boolean;
  setToolsDrawerOpen: Dispatch<SetStateAction<boolean>>;
  activeIdx: number;
  toolMode: ToolMode;
  setToolMode: Dispatch<SetStateAction<ToolMode>>;
  selectedFurId: string | null;
  furniture: PlacedFurniture[];
  angleInputDeg: string;
  setAngleInputDeg: Dispatch<SetStateAction<string>>;
  moveFurniture: (id: string, x: number, y: number, rotation: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  setShowHelp: Dispatch<SetStateAction<boolean>>;
  setPresetVersion: Dispatch<SetStateAction<number>>;
  screenshotStatus: 'idle' | 'saved' | 'error';
  handleScreenshot: () => void;
  hasScan: boolean;
  showScan: boolean;
  setShowScan: Dispatch<SetStateAction<boolean>>;
  sceneLightOn: boolean;
  setSceneLightOn: Dispatch<SetStateAction<boolean>>;
  lightsOn: boolean;
  setLightsOn: Dispatch<SetStateAction<boolean>>;
  sunHour: number;
  setSunHour: (hour: number) => void;
  setShowAiSheet: Dispatch<SetStateAction<boolean>>;
  setShowPanel: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <>
      {toolbarSlot && createPortal(
        <TopDrawerButton active={toolsDrawerOpen} onClick={() => setToolsDrawerOpen((v) => !v)} label="Asboblar">
          <Wrench size={18} strokeWidth={2} />
        </TopDrawerButton>,
        toolbarSlot,
      )}
      <TopDrawer open={toolsDrawerOpen} onOpenChange={setToolsDrawerOpen} title="Asboblar" topOffset={toolbarSlotTop ?? 0}>
        <div className="flex flex-col divide-y divide-gray-100 pb-2">

          {/* Current stage label */}
          {activeIdx >= 0 && (
            <div className="px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">
                Bosqich: {RENO_STAGES[activeIdx].label}
              </span>
            </div>
          )}

          {/* The old "Ko'rinish" view-preset chips lived here. "Yuqori"
              (top view) is gone from this page, and the remaining view
              switching (Ichki / Tashqi) moved into the segmented
              control floating over the viewport's top-right corner. */}

          {/* Tool modes */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Asbob rejimi</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setToolMode('select')}
                title="Tanlash"
                aria-pressed={toolMode === 'select'}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                  toolMode === 'select' ? 'bg-white shadow text-gray-800 border-gray-300' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 0l16 10.5-7 1.5 4 8-2.5 1-4-8-6.5 4.5z"/>
                </svg>
                <span>Tanlash</span>
              </button>
              <button
                onClick={() => setToolMode('move')}
                title="Siljitish"
                aria-pressed={toolMode === 'move'}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                  toolMode === 'move' ? 'bg-brand text-white shadow border-brand' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11 3l-4 4h3v3H7V7l-4 4 4 4v-3h3v3H7l4 4 4-4h-3v-3h3v3l4-4-4-4v3h-3V7h3l-4-4z"/>
                </svg>
                <span>Siljitish</span>
              </button>
              <button
                onClick={() => setToolMode('rotate')}
                title="Aylantirish"
                aria-pressed={toolMode === 'rotate'}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                  toolMode === 'rotate' ? 'bg-brand text-white shadow border-brand' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span>Aylantirish</span>
              </button>
              <button
                onClick={() => setToolMode('scale')}
                title="O'lcham"
                aria-pressed={toolMode === 'scale'}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                  toolMode === 'scale' ? 'bg-brand text-white shadow border-brand' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 21H3M21 3H3M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>
                </svg>
                <span>O'lcham</span>
              </button>
              <button
                onClick={() => setToolMode('part')}
                title="Qismlar — model ichidagi qismni tanlash, ajratish yoki o'chirish"
                aria-pressed={toolMode === 'part'}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                  toolMode === 'part' ? 'bg-brand text-white shadow border-brand' : 'bg-gray-100 text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/>
                  <path d="M12 11l8-4.5M12 11v9M12 11L4 6.5"/>
                  <path d="M16 3.5l-8 4.5"/>
                </svg>
                <span>Qismlar</span>
              </button>
            </div>
            {/* Rotation angle input — only while an object is selected in rotate mode */}
            {toolMode === 'rotate' && selectedFurId && (() => {
              const item = furniture.find(f => f.id === selectedFurId)
              if (!item) return null
              const currentDeg = Math.round(item.rotation * (180 / Math.PI))
              return (
                <form
                  className="flex items-center gap-2 mt-3"
                  onSubmit={e => {
                    e.preventDefault()
                    const deg = parseFloat(angleInputDeg)
                    if (!isNaN(deg)) {
                      moveFurniture(item.id, item.x, item.y, deg * (Math.PI / 180))
                      setAngleInputDeg('')
                    }
                  }}
                >
                  <input
                    key={selectedFurId + currentDeg}
                    type="number"
                    defaultValue={currentDeg}
                    onChange={e => setAngleInputDeg(e.target.value)}
                    placeholder={`${currentDeg}°`}
                    className="w-20 text-sm border border-gray-300 rounded px-2 py-1.5 text-center focus:outline-none focus:border-brand"
                    title="Burchakni darajada kiriting va Enter bosing"
                  />
                  <span className="text-gray-500 text-sm">°</span>
                  <button type="submit" className="text-sm px-3 py-1.5 bg-brand text-white rounded font-medium">✓</button>
                </form>
              )
            })()}
          </div>

          {/* Undo/redo — Ctrl+Z / Ctrl+Y work from any studio tab (see
              StudioPage.tsx), these buttons are the discoverable,
              touch-friendly equivalent for this tab specifically. */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tarix</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => useRoomStore.temporal.getState().undo()}
                disabled={!canUndo}
                title="Bekor qilish (Ctrl+Z)"
                aria-label="Bekor qilish (Ctrl+Z)"
                className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14L4 9l5-5"/>
                  <path d="M4 9h11a5 5 0 0 1 0 10h-1"/>
                </svg>
                <span>Bekor qilish</span>
              </button>
              <button
                onClick={() => useRoomStore.temporal.getState().redo()}
                disabled={!canRedo}
                title="Qaytarish (Ctrl+Y)"
                aria-label="Qaytarish (Ctrl+Y)"
                className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-500 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 14l5-5-5-5"/>
                  <path d="M20 9H9a5 5 0 0 0 0 10h1"/>
                </svg>
                <span>Qaytarish</span>
              </button>
            </div>
          </div>

          {/* View controls: help, recenter, screenshot. The cutaway
              toggle moved to the segmented control over the viewport's
              top-right corner. */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ko'rish</p>
            <div className="flex flex-wrap gap-2">
              {/* Navigation help */}
              <button
                onClick={() => setShowHelp(v => !v)}
                title="Boshqaruv bo'yicha yordam"
                aria-label="Boshqaruv bo'yicha yordam"
                className="flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] min-w-[44px] rounded-full text-sm font-bold transition-colors border bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
              >
                ?
              </button>
              {/* Recenter: snap the orbit pivot back to the room centre */}
              <button
                onClick={() => setPresetVersion(n => n + 1)}
                title="Markazlash — kamerani xona markaziga qaytarish"
                aria-label="Markazlash — kamerani xona markaziga qaytarish"
                className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                </svg>
                <span>Markaz</span>
              </button>
              {/* Skrinshot: grabs the live canvas (same glCanvasRef +
                  preserveDrawingBuffer setup as the project-card thumbnail
                  above) as a lossless PNG and downloads it — no server call,
                  no shareable link, just the smallest useful export. */}
              <button
                onClick={handleScreenshot}
                title="Skrinshot — dizaynni rasm sifatida saqlash"
                aria-label="Skrinshot — dizaynni rasm sifatida saqlash"
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                  screenshotStatus === 'saved'
                    ? 'bg-success text-white border-success'
                    : screenshotStatus === 'error'
                    ? 'bg-red-100 text-red-600 border-red-300'
                    : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                }`}
              >
                {screenshotStatus === 'saved' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : screenshotStatus === 'error' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8V6a1 1 0 0 1 1-1h2l1.5-2h7L17 5h2a1 1 0 0 1 1 1v2" />
                    <path d="M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
                    <circle cx="12" cy="13.5" r="3.5" />
                  </svg>
                )}
                <span aria-live="polite">
                  {screenshotStatus === 'saved' ? 'Saqlandi' : screenshotStatus === 'error' ? 'Xato' : 'Skrinshot'}
                </span>
              </button>
              {/* Scan reference layer — only for LiDAR-scanned rooms.
                  Overlays the semi-transparent RoomPlan GLB + translucent
                  ghost boxes for every detected object. Reference only. */}
              {hasScan && (
                <button
                  onClick={() => setShowScan(v => !v)}
                  title={showScan ? uz.studio.skan.korinishi_yoq : uz.studio.skan.korinishi_bor}
                  aria-label={showScan ? uz.studio.skan.korinishi_yoq : uz.studio.skan.korinishi_bor}
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                    showScan
                      ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                    <path d="M3 12h18" />
                  </svg>
                  <span>{uz.studio.skan.korinishi}</span>
                </button>
              )}
            </div>
            {hasScan && showScan && (
              <p className="mt-2 text-xs text-amber-700">{uz.studio.skan.izoh}</p>
            )}
          </div>

          {/* ── Lighting cluster: day/night, sun clock, room lights ── */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Yoritish</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Scene light (sun + environment) toggle */}
                <button
                  onClick={() => setSceneLightOn(v => !v)}
                  title={sceneLightOn ? "Sahna yorug'ligini o'chirish" : "Sahna yorug'ligini yoqish"}
                  aria-label={sceneLightOn ? "Sahna yorug'ligini o'chirish" : "Sahna yorug'ligini yoqish"}
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                    sceneLightOn
                      ? 'bg-brand text-white border-brand hover:bg-brand/90'
                      : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                  <span>{sceneLightOn ? 'Kunduz' : 'Tun'}</span>
                </button>
                <button
                  onClick={() => setLightsOn(v => !v)}
                  title={lightsOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
                  aria-label={lightsOn ? "Chiroqni o'chirish" : "Chiroqni yoqish"}
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors border ${
                    lightsOn
                      ? 'bg-brand text-white border-brand hover:bg-brand/90'
                      : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.7 10.2 19 8.7 19 7c0-3.3-2.7-6-6-6S7 3.7 7 7c0 1.7 1.3 3.2 2.5 4.5.8.8 1.3 1.5 1.5 2.5"/>
                    <path d="M9 18h6M10 22h4"/>
                  </svg>
                  <span>{lightsOn ? 'Yoqilgan' : "O'chirilgan"}</span>
                </button>
              </div>
              {/* Sun clock. Only meaningful while the sun is the light source, so
                  it rides with the day/night toggle. */}
              {sceneLightOn && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-full border border-amber-200 bg-amber-50"
                  title="Quyosh vaqti — Toshkent bo'yicha"
                >
                  <span className="text-xs font-medium text-gray-500 shrink-0">Vaqt:</span>
                  <span className="text-sm font-semibold text-amber-800 tabular-nums w-10 text-right">
                    {formatClock(sunHour)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={23.75}
                    step={0.25}
                    value={sunHour}
                    onChange={(e) => setSunHour(parseFloat(e.target.value))}
                    aria-label="Quyosh vaqti"
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>

          {/* AI builder button — stays visually distinct from the Kunduz/
              Yoqilgan brand-blue toggles (it's a one-shot special action,
              not a peer toggle), but now via the app's own warning/orange
              accent token (same family as the "Buyum qo'shish" CTA) rather
              than an unrelated purple with no other usage on the page. */}
          <div className="px-4 py-3">
            <button
              onClick={() => setShowAiSheet(true)}
              title="AI bilan qurish"
              aria-label="AI bilan qurish"
              className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-full text-sm font-semibold bg-warning text-white hover:bg-warning-dark transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
              </svg>
              <span>AI bilan qurish</span>
            </button>
          </div>

          {/* Mobile: design panel toggle. Closes the help card too — two
              overlays open at once is never useful, even though the
              z-index stack (backdrop z-40 over help card z-30) already
              keeps them from visually colliding. */}
          <div className="lg:hidden px-4 py-3">
            <button
              onClick={() => { setShowPanel(v => !v); setShowHelp(false); }}
              title="Dizayn paneli"
              aria-label="Dizayn paneli"
              className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-sm font-medium bg-brand text-white"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r="2.5"/><circle cx="19" cy="17" r="2.5"/><circle cx="6" cy="17" r="2.5"/>
                <path d="M13.5 9v3.5M19 14.5V11l-5.5-2M6 14.5V11l5.5-2"/>
              </svg>
              <span>Dizayn paneli</span>
            </button>
          </div>

        </div>
      </TopDrawer>
    </>
  );
}
