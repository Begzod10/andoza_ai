/**
 * The corner arc menu's three categories, built from the same sources the
 * design panel reads — not from the "Buyum qo'shish" sheet.
 *
 *   Mebel  → the model picker's inventory: your uploads + the do'kon catalog
 *            (MebelSection's `allCatalogEntries`), followed by the same four
 *            grouped into the same four rooms the "Buyum qo'shish" sheet
 *            offers as chips, plus your own uploads — the whole catalog in
 *            one arc is a long scroll when the user knows they want a bed
 *   Rang   → the shared wallpaper library (DesignPanel's `listWallpapers`)
 *   Chiroq → the fixture palette (LightPanel's `LIGHT_TYPES`)
 *
 * Picking one does exactly what its panel does: place the model, apply the
 * wallpaper to the selected wall, drop the fixture in the room. Those are all
 * store writes, which is how MebelSection and LightPanel already work — the
 * room's own Saqlash persists them.
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import { Sofa, Lightbulb, Wallpaper, Grid3x3, Ruler, Frame, BedDouble, ChefHat, Bath, Upload, Ban, Plus, Store } from 'lucide-react'
import { FurnitureSymbol, LightSymbol } from '@/lib/catalogIcons'
import { useRoomStore } from '@/store/roomStore'
import { listWallpapers, type Wallpaper as WallpaperEntry } from '@/lib/api'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { FLOOR_PATTERN_DEFS, type FloorPatternId, type FloorPatternSettings } from '@/lib/floorGeometry'
import { FLOOR_COLORS } from '@/pages/studio/three-d/constants'
import { TILE_SIZES, TILE_FACES, TILE_PATTERN_ID, tileSettings } from '@/lib/tileCatalog'
import { TileThumb } from '@/components/studio/TileThumb'
import { trimLabel, trimProfilesOf, type TrimProfileDef } from '@/lib/trimProfiles'
import { PatternThumb, TrimThumb } from '@/components/studio/design-panel/FloorControls'
import { furniturePlacementMm, nextLightPositionMm } from '@/lib/placement'
import { resolveTargetWall } from '@/components/studio/design-panel/shared'
import type { ArcCategory, ArcItem } from '@/components/studio/QuarterArcMenu'

export interface ArcCategoriesDeps {
  /** Which wall a picked wallpaper lands on — the viewport's current pick,
   *  same as the design panel uses, falling back to every wall. */
  selectedWall: string | null
  /** Opens the full panel for a category the arc can only show a slice of. */
  openPanelAt: (phase: 'boyoq' | 'chiroq' | 'mebel') => void
}

export function useArcCategories({ selectedWall, openPanelAt }: ArcCategoriesDeps): ArcCategory[] {
  // `t` changes with the language, so the memo below rebuilds the labels.
  const { t } = useTranslation()
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const catalogFurniture = useRoomStore((s) => s.catalogFurniture)
  const furniture = useRoomStore((s) => s.furniture)
  const lights = useRoomStore((s) => s.lights)
  const geometry = useRoomStore((s) => s.geometry)
  const placeFurniture = useRoomStore((s) => s.placeFurniture)
  const addLight = useRoomStore((s) => s.addLight)
  const setWallCovering = useRoomStore((s) => s.setWallCovering)
  const setDesignState = useRoomStore((s) => s.setDesignState)
  const floorType = useRoomStore((s) => s.designState.floorType)
  const floorTexture = useRoomStore((s) => s.designState.floorTexture)
  const floorPattern = useRoomStore((s) => s.designState.floorPattern)

  // The same query key and scope the design panel's Oboy tab uses, so the two
  // share one cache entry and an upload made in the panel shows up here with
  // no extra request.
  const { data: wallpapers = [] } = useQuery<WallpaperEntry[]>({
    queryKey: ['wallpapers', 'oboy'],
    queryFn: () => listWallpapers({ kind: 'oboy' }),
    staleTime: 60_000,
  })

  return useMemo(() => {
    const uploads: ArcItem[] = [
      ...userFurniture.map((e) => ({
        key: `user:${e.id}`,
        label: e.name,
        icon: <FurnitureSymbol emoji={e.emoji} size={19} strokeWidth={1.8} />,
        imageUrl: e.thumbnailUrl,
        onSelect: () => placeFurniture({
          id: nanoid(),
          furniture_id: e.id,
          ...furniturePlacementMm(geometry, furniture.filter((f) => f.furniture_id === e.id).length, e.sizeM),
          rotation: 0,
        }),
      })),
    ]

    /** The catalog rows for one room, the way the sheet scopes them: a model
     *  with no room of its own (a rug, a TV) belongs in every room. Lamps are
     *  left out — they have their own category. */
    const modelsForRoom = (roomTypeKey: string): ArcItem[] =>
      catalogFurniture
        .filter((f) => f.category !== 'lampa' && (f.room_type === null || f.room_type === roomTypeKey))
        .map((f) => ({
          key: `shop:${roomTypeKey}:${f.id}`,
          label: f.name_uz,
          icon: <Store size={19} strokeWidth={1.8} />,
          imageUrl: f.thumbnail_url ?? undefined,
          onSelect: () => placeFurniture({
            id: nanoid(),
            furniture_id: f.id,
            ...furniturePlacementMm(geometry, furniture.filter((x) => x.furniture_id === f.id).length,
              { w: (f.footprint_w ?? 0) / 100, d: (f.footprint_d ?? 0) / 100 }),
            rotation: 0,
          }),
        }))

    const papers: ArcItem[] = wallpapers.map((w) => ({
      key: `wp:${w.id}`,
      label: w.name,
      imageUrl: w.url,
      onSelect: () => setWallCovering(resolveTargetWall(selectedWall), {
        // The design panel's own default mapping: repeatX is tiles per metre,
        // so 1.0 is a 100 cm x 100 cm sheet, undistorted.
        kind: 'texture', url: w.url, color: '#ffffff',
        repeatX: 1.0, repeatY: 1.0, offsetX: 0, offsetY: 0, rotation: 0,
      }),
    }))

    const fixtures: ArcItem[] = LIGHT_TYPES.map((lt) => ({
      key: `light:${lt.id}`,
      label: t(lt.nameKey),
      icon: <LightSymbol type={lt.id} size={19} strokeWidth={1.8} />,
      onSelect: () => addLight({
        id: nanoid(),
        type: lt.id,
        ...nextLightPositionMm(geometry, lights.length),
        ...(lt.mount === 'wall' ? { wallId: 'A' as const } : {}),
      }),
    }))

    // Pol — the two materials a floor is, as the surface ring offers them:
    // Parket leads to the laying patterns, Kafel to a tile size and then its
    // face. Each pattern is previewed with the real geometry the floor will be
    // built from, exactly as the design panel draws them.
    const baseColor = FLOOR_COLORS[floorType] ?? FLOOR_COLORS.parquet
    const carriedTexture = floorPattern?.settings?.textureUrl ?? floorTexture ?? null
    const patterns: ArcItem[] = FLOOR_PATTERN_DEFS.map((def) => ({
      key: `pol:${def.id}`,
      label: t(def.labelKey),
      fill: <PatternThumb def={def} color={baseColor} textureUrl={carriedTexture} />,
      onSelect: () => {
        // The panel's own rule: take the pattern's own numbers — its plank
        // sizes, its arris, its tone variation — and carry over only a floor
        // image, which is a choice about the wood rather than the laying.
        const kept: FloorPatternSettings = {}
        if (carriedTexture) kept.textureUrl = carriedTexture
        setDesignState({ floorPattern: { id: def.id as FloorPatternId, settings: kept }, floorConfigured: true })
      },
    }))

    /** Plintus and Karniz differ only in which run of trim they write. */
    const trimItems = (kind: 'skirting' | 'cornice'): ArcItem[] => [
      // Taking the run out is one of the choices: a room can have no cornice,
      // and a user who added one needs a way back.
      {
        key: `${kind}:none`,
        label: t('studio.radial.yoq'),
        icon: <Ban size={19} strokeWidth={1.8} />,
        onSelect: () => setDesignState(kind === 'skirting' ? { skirting: null } : { cornice: null }),
      },
      ...trimProfilesOf(kind).map((def: TrimProfileDef) => ({
        key: `${kind}:${def.id}`,
        label: trimLabel(def),
        // The catalogue's own section drawing where there is one — the same
        // preview the surface ring shows. `detail={false}` asked for the flat
        // silhouette, which threw away the milled detail that tells one
        // profile from the next.
        fill: <TrimThumb def={def} />,
        // Switching profile adopts that profile's own catalogue sizes, the
        // same thing the panel's picker does.
        onSelect: () => setDesignState(
          kind === 'skirting'
            ? { skirting: { id: def.id, heightMm: def.defaultHeightMm, widthMm: def.defaultWidthMm } }
            : { cornice: { id: def.id, heightMm: def.defaultHeightMm, widthMm: def.defaultWidthMm } },
        ),
      })),
    ]

    return [
      {
        // Mebel opens the rooms first, and a room opens its models: the whole
        // catalog in one arc was a long scroll when the user knows they want
        // a bed. Uploads keep a room of their own, since they have no room
        // type in the catalog and would otherwise have nowhere to appear.
        key: 'mebel',
        label: t('studio.shared.mebel'),
        icon: <Sofa size={19} strokeWidth={1.8} />,
        items: [
          {
            key: 'room:mehmonxona', label: t('studio.add.room_mehmonxona'),
            icon: <Sofa size={19} strokeWidth={1.8} />,
            items: modelsForRoom('mehmonxona'),
            onSelect: () => {},
          },
          {
            key: 'room:oshxona', label: t('studio.add.room_oshxona'),
            icon: <ChefHat size={19} strokeWidth={1.8} />,
            items: modelsForRoom('oshxona'),
            onSelect: () => {},
          },
          {
            key: 'room:yotoqxona', label: t('studio.add.room_yotoqxona'),
            icon: <BedDouble size={19} strokeWidth={1.8} />,
            items: modelsForRoom('yotoqxona'),
            onSelect: () => {},
          },
          {
            key: 'room:vanna', label: t('studio.add.room_vanna'),
            icon: <Bath size={19} strokeWidth={1.8} />,
            items: modelsForRoom('hammom'),
            onSelect: () => {},
          },
          ...(uploads.length
            ? [{
                key: 'room:yuklangan', label: t('studio.arc.uploaded'),
                icon: <Upload size={19} strokeWidth={1.8} />,
                items: uploads,
                onSelect: () => {},
              }]
            : []),
        ],
        // Nothing uploaded yet: the panel is where you add one, so send them
        // there rather than showing an arc with nothing on it.
        emptyItem: { key: 'mebel:none', label: t('studio.radial.panel'), icon: <Plus size={19} strokeWidth={1.8} />, onSelect: () => openPanelAt('mebel') },
      },
      {
        key: 'rang',
        label: t('studio.radial.rang'),
        icon: <Wallpaper size={19} strokeWidth={1.8} />,
        items: papers,
        emptyItem: { key: 'rang:none', label: t('studio.radial.panel'), icon: <Plus size={19} strokeWidth={1.8} />, onSelect: () => openPanelAt('boyoq') },
      },
      {
        key: 'chiroq',
        label: t('studio.shared.chiroq'),
        icon: <Lightbulb size={19} strokeWidth={1.8} />,
        items: fixtures,
        emptyItem: { key: 'chiroq:none', label: t('studio.radial.panel'), icon: <Plus size={19} strokeWidth={1.8} />, onSelect: () => openPanelAt('chiroq') },
      },
      {
        key: 'pol',
        label: t('studio.shared.pol'),
        icon: <Grid3x3 size={19} strokeWidth={1.8} />,
        items: [
          {
            key: 'pol:parket',
            label: t('studio.shared.parket'),
            icon: <Grid3x3 size={19} strokeWidth={1.8} />,
            items: patterns,
            onSelect: () => {},
          },
          {
            key: 'pol:kafel',
            label: t('studio.shared.kafel'),
            icon: <Grid3x3 size={19} strokeWidth={1.8} />,
            // Size first, then the face: with tile, those are the two things
            // being chosen, and neither is a choice without the other.
            items: TILE_SIZES.map((size) => ({
              key: `kafel:${size.label}`,
              label: size.label,
              fill: <TileThumb lengthCm={size.lengthCm} widthCm={size.widthCm} color={FLOOR_COLORS.tile} />,
              onSelect: () => {},
              items: TILE_FACES.map((face) => ({
                key: `kafel:${size.label}:${face.url ?? 'plain'}`,
                label: t(face.labelKey),
                ...(face.url
                  ? { imageUrl: face.url }
                  : { fill: <TileThumb lengthCm={size.lengthCm} widthCm={size.widthCm} color={FLOOR_COLORS.tile} /> }),
                onSelect: () => setDesignState({
                  floorType: 'tile',
                  floorPattern: { id: TILE_PATTERN_ID as FloorPatternId, settings: tileSettings(size, face) },
                  floorConfigured: true,
                }),
              })),
            })),
            onSelect: () => {},
          },
        ],
      },
      {
        key: 'plintus',
        label: t('studio.shared.plintus'),
        icon: <Ruler size={19} strokeWidth={1.8} />,
        items: trimItems('skirting'),
      },
      {
        key: 'karniz',
        label: t('studio.shared.karniz'),
        icon: <Frame size={19} strokeWidth={1.8} />,
        items: trimItems('cornice'),
      },
    ]
  }, [
    userFurniture, catalogFurniture, furniture, wallpapers, lights, geometry,
    placeFurniture, addLight, setWallCovering, selectedWall, openPanelAt,
    setDesignState, floorType, floorTexture, floorPattern, t,
  ])
}
