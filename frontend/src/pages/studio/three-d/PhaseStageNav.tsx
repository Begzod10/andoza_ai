import { createPortal } from "react-dom";
import type { Dispatch, SetStateAction } from "react";
import { Layers } from "lucide-react";
import { TopDrawer, TopDrawerButton } from "@/components/ui/TopDrawer";
import { RENO_STAGES, type PhaseKey } from "@/lib/phases";

/**
 * Renovation-phase navigation: the mobile stage strip (collapsed into a
 * round drawer trigger, portaled into StudioPage's header) and the
 * desktop-only collapsible left phase-stepper sidebar. Split out of
 * ThreeDPage.tsx — see that file's header comment for the full picture.
 */
export function PhaseStageNav({
  toolbarSlot, toolbarSlotTop,
  stageDrawerOpen, setStageDrawerOpen,
  leftOpen, setLeftOpen,
  activeIdx, setActivePhase,
}: {
  toolbarSlot?: HTMLDivElement | null;
  toolbarSlotTop?: number;
  stageDrawerOpen: boolean;
  setStageDrawerOpen: Dispatch<SetStateAction<boolean>>;
  leftOpen: boolean;
  setLeftOpen: Dispatch<SetStateAction<boolean>>;
  activeIdx: number;
  setActivePhase: (phase: PhaseKey) => void;
}) {
  return (
    <>
      {/* ── Mobile: stage strip collapsed into a round drawer trigger,
          portaled into StudioPage's header so it sits in that one row
          alongside the section-switcher and the tools-drawer trigger below,
          instead of a separate row of its own. ── */}
      {toolbarSlot && createPortal(
        <div className="lg:hidden">
          <TopDrawerButton active={stageDrawerOpen} onClick={() => setStageDrawerOpen((v) => !v)} label="Bosqichlar">
            <Layers size={18} strokeWidth={2} />
          </TopDrawerButton>
        </div>,
        toolbarSlot,
      )}
      <TopDrawer open={stageDrawerOpen} onOpenChange={setStageDrawerOpen} title="Bosqichlar" topOffset={toolbarSlotTop ?? 0}>
        <div className="py-2">
          {RENO_STAGES.map((stage, i) => {
            const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
            return (
              <button
                key={stage.key}
                onClick={() => { setActivePhase(stage.key); setStageDrawerOpen(false); }}
                title={stage.label}
                aria-label={stage.label}
                aria-current={status === 'current' ? 'step' : undefined}
                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-left transition-colors ${
                  status === 'current' ? 'bg-brand text-white' :
                  status === 'done'    ? 'text-emerald-700 hover:bg-gray-50' :
                                         'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {status === 'done' && (
                  <svg width="14" height="14" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M1.5 5.5l3 3 5-5"/>
                  </svg>
                )}
                {status === 'current' && <span className="w-2 h-2 rounded-full bg-white/90 inline-block shrink-0" />}
                {status === 'pending' && <span className="w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0" />}
                <span>{stage.label}</span>
              </button>
            );
          })}
        </div>
      </TopDrawer>

      {/* ── Desktop: left phase stepper sidebar, collapsible ── */}
      <div className="relative hidden lg:block shrink-0">
      <nav
        aria-hidden={!leftOpen}
        className="hidden lg:flex bg-surface border-r border-gray-200 flex-col pt-3 select-none overflow-hidden"
        style={{
          width: leftOpen ? 144 : 0,
          // `visibility` (not just width/overflow) so the collapsed rail's
          // buttons drop out of the Tab order and the AT tree — width:0 +
          // overflow:hidden alone still leaves them focusable-by-Tab while
          // invisible. Delayed only on the way to hidden so the width
          // animation still visibly plays first; instant on the way back to
          // visible so content reappears in step with the width growing.
          visibility: leftOpen ? 'visible' : 'hidden',
          transition: leftOpen
            ? 'width 0.2s ease, visibility 0s linear 0s'
            : 'width 0.2s ease, visibility 0s linear 0.2s',
        }}
      >
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest px-4 mb-2">Bosqichlar</p>
        {RENO_STAGES.map((stage, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'pending';
          return (
            <button
              key={stage.key}
              onClick={() => setActivePhase(stage.key)}
              title={stage.label}
              aria-label={stage.label}
              aria-current={status === 'current' ? 'step' : undefined}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold text-left transition-colors ${
                status === 'current'
                  ? 'bg-brand text-white'
                  : status === 'done'
                  ? 'text-emerald-700 hover:bg-gray-50'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {status === 'done' && (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M1.5 5.5l3 3 5-5"/>
                </svg>
              )}
              {status === 'current' && (
                <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse inline-block shrink-0" />
              )}
              {status === 'pending' && (
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0" />
              )}
              <span className="leading-tight">{stage.label}</span>
            </button>
          );
        })}
      </nav>
      {/* Docked to the rail's visible edge — left offset tracks leftOpen so
          it always sits flush against wherever the rail's edge currently is,
          mid-transition included. */}
      <button
        onClick={() => setLeftOpen(v => !v)}
        title={leftOpen ? "Bosqichlar panelini yopish" : "Bosqichlar panelini ochish"}
        aria-label={leftOpen ? "Bosqichlar panelini yopish" : "Bosqichlar panelini ochish"}
        className="hidden lg:flex items-center justify-center bg-white border border-gray-200 shadow-md rounded-full hover:bg-gray-50 transition-colors"
        style={{
          position: 'absolute',
          top: '50%',
          left: leftOpen ? 144 : 0,
          // Open: straddle the rail's edge (plenty of room at x=144). Closed:
          // the rail is flush against the true page edge (x=0), so the usual
          // -50% centering would push half the button past x=0 — clipped by
          // the viewport with no way to see or click it back open. Anchor
          // flush instead, extending inward, so it's always fully visible.
          transform: leftOpen ? 'translate(-50%, -50%)' : 'translate(0, -50%)',
          width: 22,
          height: 40,
          // zIndex:5 got painted over by the R3F <canvas> (a sibling deep in
          // a different part of the tree, so a low z-index here didn't
          // reliably out-rank it — confirmed via elementFromPoint returning
          // the canvas, not this button). Same z-tier as the mobile panel
          // sheet (z-50)/backdrop (z-40), comfortably above the canvas.
          zIndex: 60,
          transition: 'left 0.2s ease',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: leftOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s ease' }}
        >
          <path d="M6.5 1L2.5 5l4 4" />
        </svg>
      </button>
      </div>
    </>
  );
}
