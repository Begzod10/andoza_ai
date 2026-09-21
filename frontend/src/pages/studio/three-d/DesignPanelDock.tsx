import type { Dispatch, SetStateAction } from "react";
import { DesignPanel } from "@/components/studio/DesignPanel";
import type { Room } from "@/lib/api";
import type { PhaseKey } from "@/lib/phases";
import type { LightTypeId } from "@/lib/lightCatalog";

/**
 * The right-hand contextual design panel: a static docked sidebar on
 * desktop (collapsible, mirrors the left phase rail) and a right-half
 * slide-in panel on mobile so the 3D canvas stays visible while picking a
 * material. Split out of ThreeDPage.tsx — see that file's header comment
 * for the full picture.
 */
export function DesignPanelDock({
  showPanel, setShowPanel,
  rightOpen, setRightOpen,
  room, activePhase, selectedWall, setSelectedWall,
  selectedLightId, selectLight,
  armedLightType, setArmedLightType,
  planMode,
}: {
  showPanel: boolean;
  setShowPanel: Dispatch<SetStateAction<boolean>>;
  rightOpen: boolean;
  setRightOpen: Dispatch<SetStateAction<boolean>>;
  room: Room;
  activePhase: PhaseKey;
  selectedWall: string | null;
  setSelectedWall: Dispatch<SetStateAction<string | null>>;
  selectedLightId: string | null;
  selectLight: (id: string | null) => void;
  armedLightType: LightTypeId | null;
  setArmedLightType: Dispatch<SetStateAction<LightTypeId | null>>;
  planMode: boolean;
}) {
  return (
    <>
      {/* Mobile backdrop — transparent, not dimmed: the panel now docks to
          the right half instead of covering the screen as a bottom sheet,
          specifically so the 3D view stays fully visible on the left half
          while it's open (the whole point is watching a material apply to
          the wall live). Still catches a tap on that left half to close. */}
      {showPanel && (
        <div
          className="lg:hidden fixed inset-0 z-40"
          onClick={() => setShowPanel(false)}
        />
      )}

      {/* Outer wrapper: stable positioning context for the toggle button,
          rendered on every breakpoint (unlike the left rail's wrapper, this
          can't be `hidden` below lg — the mobile bottom-sheet panel lives in
          the same subtree). The toggle button is a SIBLING of the collapse
          wrapper below, not a child of it: nesting it inside was the actual
          bug — that wrapper's own `overflow:hidden` (needed so the panel
          clips instead of reflowing while collapsing) clipped the button
          along with it once width hit 0, even though position:absolute
          normally escapes a parent's normal flow. overflow:hidden clips
          ALL descendants that visually extend past its box, absolutely
          positioned or not. */}
      <div className="relative shrink-0 lg:h-full">
      {/* Desktop-only collapse wrapper. Harmless on mobile: the panel below
          stays `fixed` there (escapes normal flow, ignores an ancestor's
          width/overflow entirely), so this only actually clips/resizes
          anything once `lg:static` below turns the panel into a normal-flow
          box that respects it. */}
      <div
        aria-hidden={!rightOpen}
        // lg:h-full bounds this collapse wrapper to the docked area's height so
        // the panel below (lg:h-full lg:overflow-auto) and the DesignPanel
        // aside (lg:max-h-full + overflow-y-auto) resolve against a real height
        // and actually scroll — without it they sized to content and tall
        // stages (image library, Suvoq, etc.) were cut off with no scroll.
        className="lg:shrink-0 lg:h-full"
        style={{
          width: rightOpen ? 288 : 0,
          overflow: rightOpen ? 'auto' : 'hidden',
          // Same fix as the left rail's toggle: width:0 + overflow:hidden
          // alone still leaves the design panel's controls focusable-by-Tab
          // while invisible. `visibility` removes them from the Tab order
          // and the AT tree; delayed only when collapsing so the width
          // animation still plays first, instant when expanding so content
          // reappears in step with the width growing.
          visibility: rightOpen ? 'visible' : 'hidden',
          transition: rightOpen
            ? 'width 0.2s ease, visibility 0s linear 0s'
            : 'width 0.2s ease, visibility 0s linear 0.2s',
        }}
      >
      {/* Panel — desktop: static sidebar | mobile: right-half slide-in panel
          (was a bottom sheet covering ~72vh; docked to the right half
          instead so the 3D canvas on the left stays visible and live while
          picking a material — the actual point of this panel). */}
      <div
        className={[
          /* mobile base */
          'fixed top-0 right-0 bottom-0 z-50 w-1/2 shadow-2xl transition-transform duration-300 ease-in-out overflow-y-auto bg-surface',
          showPanel ? 'translate-x-0' : 'translate-x-full',
          /* desktop override */
          'lg:static lg:translate-x-0 lg:w-auto lg:h-full lg:shadow-none lg:z-auto lg:overflow-auto',
        ].join(' ')}
      >
        {/* Mobile close button — replaces the old drag-to-dismiss handle,
            which doesn't make sense for a side panel. Tapping the now-
            transparent backdrop on the left half also closes it. */}
        <div className="lg:hidden flex justify-end p-2">
          <button
            onClick={() => setShowPanel(false)}
            aria-label="Yopish"
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13"/>
            </svg>
          </button>
        </div>
        <DesignPanel room={room} phase={activePhase} selectedWall={selectedWall} onWallChange={setSelectedWall}
          selectedLightId={selectedLightId} onLightChange={selectLight}
          armedLightType={armedLightType} onArmLight={setArmedLightType} planMode={planMode} />
      </div>
      </div>
      {/* Docked to the panel's left edge (mirrors the left rail's toggle,
          chevron pointing the opposite way). Sibling of the collapse
          wrapper above, not nested in it — see the comment on the outer
          wrapper for why. */}
      <button
        onClick={() => setRightOpen(v => !v)}
        title={rightOpen ? "Dizayn panelini yopish" : "Dizayn panelini ochish"}
        aria-label={rightOpen ? "Dizayn panelini yopish" : "Dizayn panelini ochish"}
        className="hidden lg:flex items-center justify-center bg-white border border-gray-200 shadow-md rounded-full hover:bg-gray-50 transition-colors"
        style={{
          position: 'absolute',
          top: '50%',
          right: rightOpen ? 288 : 0,
          // Same fix as the left rail's toggle: closed means flush against
          // the true page edge, where +50% centering would push half the
          // button past the viewport — visible only as a sliver, unclickable
          // in practice. Anchor flush and extend inward instead when closed.
          transform: rightOpen ? 'translate(50%, -50%)' : 'translate(0, -50%)',
          width: 22,
          height: 40,
          // zIndex:5 got painted over by the R3F <canvas> (a sibling deep in
          // a different part of the tree, so a low z-index here didn't
          // reliably out-rank it — confirmed via elementFromPoint returning
          // the canvas, not this button). Same z-tier as the mobile panel
          // sheet (z-50)/backdrop (z-40), comfortably above the canvas.
          zIndex: 60,
          transition: 'right 0.2s ease',
        }}
      >
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#4B5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: rightOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
        >
          <path d="M6.5 1L2.5 5l4 4" />
        </svg>
      </button>
      </div>
    </>
  );
}
