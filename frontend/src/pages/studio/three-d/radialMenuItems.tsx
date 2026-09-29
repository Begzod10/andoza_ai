import { RadialIcons, type RadialItem } from "@/components/studio/SurfaceRadialMenu";
import type { PhaseKey } from "@/lib/phases";
import type { RadialState } from "./useSurfaceRadialMenu";
import { CATALOG as ELECTRICAL_CATALOG } from "@/pages/studio/placement/constants";
import { LIGHT_TYPES } from "@/lib/lightCatalog";
import { trimProfilesOf } from "@/lib/trimProfiles";
import { WINDOW_STYLES } from "@/lib/windowStyles";
import { WindowPreview } from "@/lib/windowPreview";
import { DOOR_STYLES } from "@/lib/doorStyles";
import { DoorPreview } from "@/lib/doorPreview";
import { PatternThumb, TrimThumb } from "@/components/studio/design-panel/FloorControls";
import { TileThumb } from "@/components/studio/TileThumb";
import { FLOOR_PATTERN_DEFS, type FloorPatternSettings } from "@/lib/floorGeometry";
import { FLOOR_COLORS } from "./constants";
import { WALL_COLORS, wallColorName } from "@/lib/wallPalette";
import { CEILING_DESIGNS, type CeilingDesignId } from "@/lib/ceilingDesigns";
import { CeilingPreview } from "@/lib/ceilingPreview";
import { LightPreview } from "@/lib/lightPreview";
import { FaceplatePreview } from "@/lib/faceplatePreview";

/** Tile sizes, in the millimetres the user buys them by. 600x600 first: it is
 *  the default, and the one most floors are laid in. */
const TILE_SIZES = [
  { label: '600×600', lengthCm: 60, widthCm: 60 },
  { label: '300×600', lengthCm: 60, widthCm: 30 },
  { label: '1200×600', lengthCm: 120, widthCm: 60 },
  { label: '400×400', lengthCm: 40, widthCm: 40 },
]

/** The tile's face. `url: null` is the plain glazed tile the pattern draws on
 *  its own — kept first so picking a size and nothing else still lands. */
const TILE_FACES: { label: string; url: string | null }[] = [
  { label: 'Oddiy', url: null },
  { label: 'Marmar oq', url: '/floor/tile/marble-white.jpg' },
  { label: 'Marmar qora', url: '/floor/tile/marble-black.jpg' },
  { label: 'Marmar kulrang', url: '/floor/tile/marble-grey.jpg' },
]

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
    /** Drops a wall device at the tapped spot. Returns nothing — the menu
     *  closes either way. */
    placeElectrical: (wallId: string, point: { x: number; y: number; z: number } | undefined, type: string, heightMm: number) => void;
    /** Hangs a fixture where the ceiling was tapped. */
    placeLight: (point: { x: number; y: number; z: number } | undefined, type: string) => void;
    /** Runs a cornice profile round the whole room, or `null` to take it out. */
    setCornice: (trim: { id: string; heightMm: number; widthMm: number } | null) => void;
    /** Same, for the skirting. */
    setSkirting: (trim: { id: string; heightMm: number; widthMm: number } | null) => void;
    /** The wallpapers the design panel's Oboy tab lists — the same query, so
     *  one upload shows up in both. */
    wallpapers: { id: string | number; name: string; url: string }[];
    /** Papers the tapped wall (or every wall, when none is picked). */
    applyWallpaper: (url: string) => void;
    /** Paints it a flat colour instead. */
    applyWallColor: (hex: string) => void;
    /** Puts a window of that style where the wall was tapped, skipping the
     *  size-and-style sheet. */
    createWindowStyled: (wallId: string, point: { x: number; y: number; z: number } | undefined, styleId: string) => void;
    /** The same for a door, at the standard 900 x 2100. */
    createDoorStyled: (wallId: string, point: { x: number; y: number; z: number } | undefined, styleId: string) => void;
    /** Restyles an opening already in the wall — the leaf design of a door,
     *  the sash layout of a window. */
    restyleOpening: (wallId: string, elId: string, styleId: string) => void;
    /** Lays the floor: a material and the pattern it is laid in. */
    setFloorPattern: (floorType: 'parquet' | 'tile', patternId: string, settings: FloorPatternSettings) => void;
    /** Reshapes the ceiling, keeping whatever settings it already had. */
    setCeilingDesign: (id: CeilingDesignId) => void;
  },
): RadialItem[] {
  const {
    setSelectedWall, setActivePhase, setShowPanel, createOpening,
    placeElectrical, placeLight, setCornice, wallpapers, applyWallpaper, applyWallColor, createWindowStyled, createDoorStyled,
    setFloorPattern, setSkirting, setCeilingDesign, restyleOpening,
  } = deps;

  /** Sends the user to the full panel — what a ring with nothing in it can
   *  still usefully offer, and where a new paper gets uploaded. */
  const openPaintPanel = (wallId: string | undefined) => {
    setSelectedWall(wallId ?? 'ALL');
    setActivePhase('boyoq');
    setShowPanel(true);
  };

  if (r.surface === 'wall') {
    return [
      {
        // Paint and paper are two different decisions and now two buttons:
        // one ring of papers with a colour hidden among them was a list the
        // user had to scroll past to reach either.
        key: 'paint', label: 'Rang', icon: RadialIcons.paint,
        childLabel: 'Rang',
        onSelect: () => openPaintPanel(r.wallId),
        // No panel escape among the colours: the palette IS the choice, and
        // the design panel is in the header's menu when more is wanted.
        children: WALL_COLORS.map((hex) => ({
          key: `color:${hex}`,
          label: wallColorName(hex),
          icon: RadialIcons.paint,
          fill: <span className="absolute inset-0" style={{ background: hex }} />,
          onSelect: () => applyWallColor(hex),
        })),
      },
      {
        key: 'oboy', label: 'Oboy', icon: RadialIcons.wallpaper,
        childLabel: 'Oboy',
        onSelect: () => openPaintPanel(r.wallId),
        children: wallpapers.length
          ? wallpapers.map((w) => ({
              key: `wp:${w.id}`,
              label: w.name,
              icon: RadialIcons.wallpaper,
              fill: <img src={w.url} alt="" loading="lazy" draggable={false}
                className="absolute inset-0 w-full h-full object-cover" />,
              onSelect: () => applyWallpaper(w.url),
            }))
          // Only when nothing has been uploaded: an empty ring is a dead end,
          // and the panel is where a paper comes from. With papers to show,
          // the ring shows papers and nothing else.
          : [{
              key: 'wp:panel', label: 'Panel', icon: RadialIcons.add,
              closesMenu: true,
              onSelect: () => openPaintPanel(r.wallId),
            }],
      },
      {
        // Window styles, straight from the ring. The sheet that asked for
        // width, height, style and colour is still there for a window that
        // needs to be exact — this is for the common case.
        key: 'window', label: 'Oyna', icon: RadialIcons.window,
        childLabel: 'Oyna',
        onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'deraza'); },
        children: [
          ...WINDOW_STYLES.map((st) => ({
            key: `win:${st.id}`,
            label: st.label,
            icon: RadialIcons.window,
            // The layout IS the style, so the preview draws it: frame,
            // mullions, glass, and a handle on the sashes that open. One grid
            // icon against all eighteen told the user nothing.
            fill: <WindowPreview style={st} />,
            onSelect: () => { if (r.wallId) createWindowStyled(r.wallId, r.point, st.id); },
          })),
          {
            key: 'win:custom', label: "O'lchamli", icon: RadialIcons.add,
            closesMenu: true,
            onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'deraza'); },
          },
        ],
      },
      {
        // The leaf designs, as the windows do it: a door is 900 x 2100
        // whatever style it wears, so the only question the ring has to ask
        // is which one.
        key: 'door', label: 'Eshik', icon: RadialIcons.door,
        childLabel: 'Eshik',
        onSelect: () => { if (r.wallId) createOpening(r.wallId, r.point, 'eshik'); },
        children: DOOR_STYLES.map((st) => ({
          key: `door:${st.id}`,
          label: st.label,
          icon: RadialIcons.door,
          fill: <DoorPreview styleId={st.id} />,
          onSelect: () => { if (r.wallId) createDoorStyled(r.wallId, r.point, st.id); },
        })),
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
          // Each fitting drawn face-on, from the same range the 3D ones are
          // modelled on: one socket icon repeated told the user nothing.
          fill: <FaceplatePreview type={entry.type} />,
          onSelect: () => { if (r.wallId) placeElectrical(r.wallId, r.point, entry.type, entry.height); },
        })),
      },
    ];
  }
  // A door or a window tapped in the room offers the designs it could be —
  // the same sheets the wall ring hangs a new one from, but changing THIS
  // opening rather than making another. Tapping the thing is how the user
  // says which one they mean.
  if (r.surface === 'door') {
    return DOOR_STYLES.map((st) => ({
      key: `door:${st.id}`,
      label: st.label,
      icon: RadialIcons.door,
      fill: <DoorPreview styleId={st.id} />,
      onSelect: () => { if (r.wallId && r.elId) restyleOpening(r.wallId, r.elId, st.id); },
    }));
  }

  if (r.surface === 'window') {
    return WINDOW_STYLES.map((st) => ({
      key: `win:${st.id}`,
      label: st.label,
      icon: RadialIcons.window,
      fill: <WindowPreview style={st} />,
      onSelect: () => { if (r.wallId && r.elId) restyleOpening(r.wallId, r.elId, st.id); },
    }));
  }

  // A trim run tapped in the room offers the profiles it could be. There is
  // no submenu: the user already said which run they mean by tapping it, so
  // the ring goes straight to the choice, scrolling through the whole sheet.
  if (r.surface === 'skirting' || r.surface === 'cornice') {
    const kind = r.surface
    return [
      // Taking the run out is one of the choices: a room can have no cornice,
      // and a user who added one needs a way back.
      {
        key: `${kind}:none`,
        label: "Yo'q",
        icon: RadialIcons.none,
        onSelect: () => (kind === 'cornice' ? setCornice : setSkirting)(null),
      },
      ...trimProfilesOf(kind).map((def) => ({
        key: `${kind}:${def.id}`,
        label: def.label,
        icon: kind === 'cornice' ? RadialIcons.cornice : RadialIcons.floor,
        fill: <TrimThumb def={def} />,
        onSelect: () => (kind === 'cornice' ? setCornice : setSkirting)({
          id: def.id,
          heightMm: def.defaultHeightMm,
          widthMm: def.defaultWidthMm,
        }),
      })),
    ]
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
          // Drawn in elevation: the catalogue's emoji were labels, not
          // pictures, and three of them read as the same blob at this size.
          fill: <LightPreview typeId={t.id} />,
          onSelect: () => placeLight(r.point, t.id),
        })),
      },
      {
        // The cornice belongs to the ceiling edge, so it is offered from the
        // ceiling tap as well as the corner menu. Each profile shows the
        // catalogue's own section drawing, filling the button — a moulding is
        // picked by looking at it, and the flat silhouette this used to show
        // threw away the milled detail that tells the profiles apart.
        key: 'karniz', label: 'Karniz', icon: RadialIcons.cornice,
        childLabel: 'Karniz',
        onSelect: () => {},
        children: [{
          key: 'cornice:none',
          label: "Yo'q",
          icon: RadialIcons.none,
          onSelect: () => setCornice(null),
        }, ...trimProfilesOf('cornice').map((def) => ({
          key: `cornice:${def.id}`,
          label: def.label,
          icon: RadialIcons.cornice,
          fill: <TrimThumb def={def} />,
          // Picking a profile adopts its own catalogue sizes, the same thing
          // the panel's picker and the corner menu do.
          onSelect: () => setCornice({
            id: def.id,
            heightMm: def.defaultHeightMm,
            widthMm: def.defaultWidthMm,
          }),
        }))],
      },
      {
        // The profiles themselves, drawn in section — the same little diagrams
        // the design panel shows. No names under them: the shape of a ceiling
        // is what is being chosen, and a label is noise beside the drawing.
        key: 'ceiling', label: 'Shift turi', icon: RadialIcons.ceiling,
        childLabel: 'Shift turi',
        onSelect: () => {},
        // No panel escape here: the shape is the whole choice, and the drop,
        // border and cove light are still reachable from the design panel
        // itself.
        children: [
          ...CEILING_DESIGNS.map((cd) => ({
            key: `ceil:${cd.id}`,
            label: cd.label,
            icon: RadialIcons.ceiling,
            fill: <CeilingPreview designId={cd.id} className="w-full h-full" />,
            hideLabel: true,
            onSelect: () => setCeilingDesign(cd.id),
          })),
        ],
      },
    ];
  }
  // floor — the two materials a floor is, and nothing else. "Narsa" (the add
  // sheet) and "Rang" (the finish panel) were removed at the user's request:
  // furniture comes from the corner menu's Mebel, and the panel is still in
  // the drawer.
  return [
    {
      // The laying patterns, previewed with the real geometry the floor is
      // built from — the same drawings the design panel and the corner menu
      // show, so a pattern is recognisable wherever it is picked.
      key: 'parket', label: 'Parket', icon: RadialIcons.floor,
      childLabel: 'Parket',
      onSelect: () => {},
      children: FLOOR_PATTERN_DEFS.map((def) => ({
        key: `parket:${def.id}`,
        label: def.label,
        icon: RadialIcons.floor,
        fill: <PatternThumb def={def} color={FLOOR_COLORS.parquet} />,
        onSelect: () => setFloorPattern('parquet', def.id, {
          plankLengthCm: def.defaultLengthCm,
          plankWidthCm: def.defaultWidthCm,
        }),
      })),
    },
    {
      // Tile is the same stack bond every time — what is actually being
      // chosen is the tile, so these are sizes rather than patterns, and each
      // previews the same square of floor so a bigger tile reads as bigger.
      key: 'kafel', label: 'Kafel', icon: RadialIcons.floor,
      childLabel: 'Kafel',
      onSelect: () => {},
      children: TILE_SIZES.map((t) => ({
        key: `kafel:${t.label}`,
        label: t.label,
        icon: RadialIcons.floor,
        fill: <TileThumb lengthCm={t.lengthCm} widthCm={t.widthCm} color={FLOOR_COLORS.tile} />,
        onSelect: () => {},
        // A size leads on to the face: both belong to the same tile, and
        // picking one without the other is not a choice anyone makes.
        childLabel: t.label,
        children: TILE_FACES.map((face) => ({
          key: `kafel:${t.label}:${face.url ?? 'plain'}`,
          label: face.label,
          icon: RadialIcons.floor,
          fill: face.url
            ? <img src={face.url} alt="" loading="lazy" draggable={false}
                className="absolute inset-0 w-full h-full object-cover" />
            : <TileThumb lengthCm={t.lengthCm} widthCm={t.widthCm} color={FLOOR_COLORS.tile} />,
          onSelect: () => setFloorPattern('tile', 'stake_bond', {
            plankLengthCm: t.lengthCm,
            plankWidthCm: t.widthCm,
            textureUrl: face.url,
            // White lets the photograph's own colours through; the tile grey
            // would tint a white marble grey.
            baseColor: face.url ? '#ffffff' : undefined,
            // The photographs are portrait, and the veining should run the
            // long way down a 1200x600 tile rather than across it.
            textureRotation: t.lengthCm > t.widthCm ? 90 : 0,
          }),
        })),
      })),
    },
  ];
}
