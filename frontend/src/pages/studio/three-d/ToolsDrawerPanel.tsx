import type { Dispatch, SetStateAction } from "react";
import { Wrench } from "lucide-react";
import { createPortal } from "react-dom";
import { TopDrawer, TopDrawerButton } from "@/components/ui/TopDrawer";
import { uz } from "@/locale/uz";
import { formatClock } from "./helpers";

/**
 * The studio's collapsed "Asboblar" toolbar drawer: the scan overlay for a
 * scanned room, the sun clock, the AI-builder entry point and the mobile
 * design-panel toggle. Split out of ThreeDPage.tsx — see that file's header
 * comment for the full picture.
 *
 * It used to carry the tool modes, undo/redo, help/recentre/screenshot and
 * the day-night toggles too. Those were removed at the user's request
 * (2026-09-28): the transform tools now sit beside the selected model
 * (ModelToolbar) and undo/redo keep their keyboard shortcuts.
 */
export function ToolsDrawerPanel({
  toolbarSlot, toolbarSlotTop, toolsDrawerOpen, setToolsDrawerOpen,
  hasScan, showScan, setShowScan,
  sceneLightOn,
  sunHour, setSunHour,
  setShowAiSheet,
  setShowPanel,
}: {
  toolbarSlot?: HTMLDivElement | null;
  toolbarSlotTop?: number;
  toolsDrawerOpen: boolean;
  setToolsDrawerOpen: Dispatch<SetStateAction<boolean>>;
  hasScan: boolean;
  showScan: boolean;
  setShowScan: Dispatch<SetStateAction<boolean>>;
  /** The sun clock only means anything while the sun is the light source. */
  sceneLightOn: boolean;
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

          {/* The LiDAR reference layer: the scan GLB plus a ghost box per
              detected object, over the modelled room. Only a scanned room has
              one, so the whole section goes with it. */}
          {hasScan && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Skan</p>
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
              {showScan && <p className="mt-2 text-xs text-amber-700">{uz.studio.skan.izoh}</p>}
            </div>
          )}

          {/* What is left of the lighting cluster: the sun clock. The
              day/night and room-light toggles were removed with the rest of
              the drawer's chrome. */}
          <div className="px-4 py-3">
            <div className="flex flex-col gap-2">
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

          {/* Mobile: design panel toggle. */}
          <div className="lg:hidden px-4 py-3">
            <button
              onClick={() => setShowPanel(v => !v)}
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
