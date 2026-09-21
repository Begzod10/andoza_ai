import { RadialIcons, type RadialItem } from "@/components/studio/SurfaceRadialMenu";
import type { PhaseKey } from "@/lib/phases";
import type { RadialState } from "./useSurfaceRadialMenu";

/**
 * The context actions offered by the surface radial ("aylana") menu for
 * each surface. Each opens the matching existing panel/sheet — the exact
 * wiring is easy to retarget later. Split out of ThreeDPage.tsx — see that
 * file's header comment for the full picture.
 */
export function buildRadialItems(
  r: NonNullable<RadialState>,
  deps: {
    setSelectedWall: (id: string | null) => void;
    setActivePhase: (phase: PhaseKey) => void;
    setShowPanel: (show: boolean) => void;
    createOpening: (wallId: string, point: { x: number; y: number; z: number } | undefined, type: 'deraza' | 'eshik') => void;
    setShowAddSheet: (show: boolean) => void;
  },
): RadialItem[] {
  const { setSelectedWall, setActivePhase, setShowPanel, createOpening, setShowAddSheet } = deps;

  if (r.surface === 'wall') {
    return [
      {
        key: 'paint', label: 'Rang', icon: RadialIcons.paint,
        onSelect: () => { setSelectedWall(r.wallId ?? 'ALL'); setActivePhase('boyoq'); setShowPanel(true); },
      },
      {
        key: 'window', label: 'Oyna', icon: RadialIcons.window,
        onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'deraza'); },
      },
      {
        key: 'door', label: 'Eshik', icon: RadialIcons.door,
        onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'eshik'); },
      },
    ];
  }
  if (r.surface === 'ceiling') {
    return [
      {
        key: 'light', label: 'Chiroq', icon: RadialIcons.light,
        onSelect: () => { setActivePhase('chiroq'); setShowPanel(true); },
      },
      {
        key: 'ceiling', label: 'Shift turi', icon: RadialIcons.ceiling,
        onSelect: () => { setSelectedWall('CEILING'); setActivePhase('boyoq'); setShowPanel(true); },
      },
    ];
  }
  // floor
  return [
    {
      key: 'object', label: 'Narsa', icon: RadialIcons.add,
      onSelect: () => setShowAddSheet(true),
    },
    {
      // Mirrors the wall/ceiling "Rang" item — routes into WallSection's
      // richer WallFloorTargetPanel (type picker + do'kon material search
      // + image upload), not the plain 4-way FloorSection picker the old
      // 'pol' phase opened.
      key: 'floor', label: 'Rang', icon: RadialIcons.floor,
      onSelect: () => { setSelectedWall('FLOOR'); setActivePhase('boyoq'); setShowPanel(true); },
    },
  ];
}
