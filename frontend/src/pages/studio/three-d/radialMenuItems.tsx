import { RadialIcons, type RadialItem } from "@/components/studio/SurfaceRadialMenu";
import type { PhaseKey } from "@/lib/phases";
import type { RadialState } from "./useSurfaceRadialMenu";
import { CATALOG as ELECTRICAL_CATALOG } from "@/pages/studio/placement/constants";
import { LIGHT_TYPES } from "@/lib/lightCatalog";
import { trimProfilesOf } from "@/lib/trimProfiles";
import { TrimThumb } from "@/components/studio/design-panel/FloorControls";

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
    /** Drops a wall device at the tapped spot. Returns nothing — the menu
     *  closes either way. */
    placeElectrical: (wallId: string, point: { x: number; y: number; z: number } | undefined, type: string, heightMm: number) => void;
    /** Hangs a fixture where the ceiling was tapped. */
    placeLight: (point: { x: number; y: number; z: number } | undefined, type: string) => void;
    /** Runs a cornice profile round the whole room. */
    setCornice: (trim: { id: string; heightMm: number; widthMm: number }) => void;
  },
): RadialItem[] {
  const { setSelectedWall, setActivePhase, setShowPanel, createOpening, setShowAddSheet, placeElectrical, placeLight, setCornice } = deps;

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
      {
        // Sockets and switches belong to a wall and to a spot on it, which is
        // exactly what a wall tap already knows — so they are offered here
        // rather than from the corner menu, which knew neither.
        key: 'elektr', label: 'Elektr', icon: RadialIcons.socket,
        childLabel: 'Elektr',
        onSelect: () => {},
        children: ELECTRICAL_CATALOG.map((entry) => ({
          key: `el:${entry.type}`,
          label: entry.label,
          icon: RadialIcons.socket,
          onSelect: () => { if (r.wallId) placeElectrical(r.wallId, r.point, entry.type, entry.height); },
        })),
      },
    ];
  }
  if (r.surface === 'ceiling') {
    return [
      {
        // The fixtures themselves, in the ring, rather than a jump to the
        // panel: a ceiling tap already says where the light goes, and sending
        // the user to a panel threw that away and made them place it again.
        key: 'light', label: 'Chiroq', icon: RadialIcons.light,
        childLabel: 'Chiroq',
        onSelect: () => {},
        children: LIGHT_TYPES.map((t) => ({
          key: `light:${t.id}`,
          label: t.name,
          icon: RadialIcons.light,
          onSelect: () => placeLight(r.point, t.id),
        })),
      },
      {
        // The cornice belongs to the ceiling edge, so it is offered from the
        // ceiling tap as well as the corner menu. The profiles show as their
        // own cross-sections (`detail={false}`): in a 20px icon the
        // catalogue's dimensioned drawing is unreadable, while the outline
        // still tells a cove from an ogee, and the T-code names it below.
        key: 'karniz', label: 'Karniz', icon: RadialIcons.cornice,
        childLabel: 'Karniz',
        onSelect: () => {},
        children: trimProfilesOf('cornice').map((def) => ({
          key: `cornice:${def.id}`,
          label: def.label,
          icon: <TrimThumb def={def} detail={false} />,
          // Picking a profile adopts its own catalogue sizes, the same thing
          // the panel's picker and the corner menu do.
          onSelect: () => setCornice({
            id: def.id,
            heightMm: def.defaultHeightMm,
            widthMm: def.defaultWidthMm,
          }),
        })),
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
