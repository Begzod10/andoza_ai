/**
 * The corner arc menu's three categories, built from the same sources the
 * design panel reads — not from the "Buyum qo'shish" sheet.
 *
 *   Mebel  → the model picker's inventory: your uploads + the do'kon catalog
 *            (MebelSection's `allCatalogEntries`)
 *   Rang   → the shared wallpaper library (DesignPanel's `listWallpapers`)
 *   Chiroq → the fixture palette (LightPanel's `LIGHT_TYPES`)
 *
 * Picking one does exactly what its panel does: place the model, apply the
 * wallpaper to the selected wall, drop the fixture in the room. Those are all
 * store writes, which is how MebelSection and LightPanel already work — the
 * room's own Saqlash persists them.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import { Sofa, Lightbulb, Wallpaper, Grid3x3, Ruler, Frame } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { listWallpapers, type Wallpaper as WallpaperEntry } from '@/lib/api'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { FLOOR_PATTERN_DEFS, type FloorPatternId, type FloorPatternSettings } from '@/lib/floorGeometry'
import { FLOOR_COLORS } from '@/pages/studio/three-d/constants'
import { trimProfilesOf, type TrimProfileDef } from '@/lib/trimProfiles'
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
    const models: ArcItem[] = [
      ...userFurniture.map((e) => ({
        key: `user:${e.id}`,
        label: e.name,
        icon: e.emoji ?? '📦',
        imageUrl: e.thumbnailUrl,
        onSelect: () => placeFurniture({
          id: nanoid(),
          furniture_id: e.id,
          ...furniturePlacementMm(geometry, furniture.filter((f) => f.furniture_id === e.id).length, e.sizeM),
          rotation: 0,
        }),
      })),
      ...catalogFurniture.map((f) => ({
        key: `shop:${f.id}`,
        label: f.name_uz,
        icon: '🏪',
        imageUrl: f.thumbnail_url ?? undefined,
        onSelect: () => placeFurniture({
          id: nanoid(),
          furniture_id: f.id,
          ...furniturePlacementMm(geometry, furniture.filter((x) => x.furniture_id === f.id).length,
            { w: (f.footprint_w ?? 0) / 100, d: (f.footprint_d ?? 0) / 100 }),
          rotation: 0,
        }),
      })),
    ]

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

    const fixtures: ArcItem[] = LIGHT_TYPES.map((t) => ({
      key: `light:${t.id}`,
      label: t.name,
      icon: t.emoji,
      onSelect: () => addLight({
        id: nanoid(),
        type: t.id,
        ...nextLightPositionMm(geometry, lights.length),
        ...(t.mount === 'wall' ? { wallId: 'A' as const } : {}),
      }),
    }))

    // Pol — the laying patterns, each previewed with the real geometry the
    // floor will be built from, exactly as the design panel draws them.
    const baseColor = FLOOR_COLORS[floorType] ?? FLOOR_COLORS.parquet
    const carriedTexture = floorPattern?.settings?.textureUrl ?? floorTexture ?? null
    const patterns: ArcItem[] = FLOOR_PATTERN_DEFS.map((def) => ({
      key: `pol:${def.id}`,
      label: def.label,
      fill: <PatternThumb def={def} color={baseColor} textureUrl={carriedTexture} />,
      onSelect: () => {
        // The panel's own rule: keep the tone and joint knobs already dialed
        // in, take the new pattern's classic plank sizes, and carry any floor
        // image over as the plank texture.
        const prev = floorPattern?.settings
        const kept: FloorPatternSettings = {}
        if (prev?.baseColor != null) kept.baseColor = prev.baseColor
        if (prev?.gapMm != null) kept.gapMm = prev.gapMm
        if (prev?.bevelMm != null) kept.bevelMm = prev.bevelMm
        if (prev?.colorVariation != null) kept.colorVariation = prev.colorVariation
        if (prev?.rotationDeg != null) kept.rotationDeg = prev.rotationDeg
        if (carriedTexture) kept.textureUrl = carriedTexture
        setDesignState({ floorPattern: { id: def.id as FloorPatternId, settings: kept }, floorConfigured: true })
      },
    }))

    /** Plintus and Karniz differ only in which run of trim they write. */
    const trimItems = (kind: 'skirting' | 'cornice'): ArcItem[] =>
      trimProfilesOf(kind).map((def: TrimProfileDef) => ({
        key: `${kind}:${def.id}`,
        label: def.label,
        fill: <TrimThumb def={def} detail={false} />,
        // Switching profile adopts that profile's own catalogue sizes, the
        // same thing the panel's picker does.
        onSelect: () => setDesignState(
          kind === 'skirting'
            ? { skirting: { id: def.id, heightMm: def.defaultHeightMm, widthMm: def.defaultWidthMm } }
            : { cornice: { id: def.id, heightMm: def.defaultHeightMm, widthMm: def.defaultWidthMm } },
        ),
      }))

    return [
      {
        key: 'mebel',
        label: 'Mebel',
        icon: <Sofa size={19} strokeWidth={1.8} />,
        items: models,
        // Nothing uploaded yet: the panel is where you add one, so send them
        // there rather than showing an arc with nothing on it.
        emptyItem: { key: 'mebel:none', label: 'Panel', icon: '➕', onSelect: () => openPanelAt('mebel') },
      },
      {
        key: 'rang',
        label: 'Rang',
        icon: <Wallpaper size={19} strokeWidth={1.8} />,
        items: papers,
        emptyItem: { key: 'rang:none', label: 'Panel', icon: '➕', onSelect: () => openPanelAt('boyoq') },
      },
      {
        key: 'chiroq',
        label: 'Chiroq',
        icon: <Lightbulb size={19} strokeWidth={1.8} />,
        items: fixtures,
        emptyItem: { key: 'chiroq:none', label: 'Panel', icon: '➕', onSelect: () => openPanelAt('chiroq') },
      },
      {
        key: 'pol',
        label: 'Pol',
        icon: <Grid3x3 size={19} strokeWidth={1.8} />,
        items: patterns,
      },
      {
        key: 'plintus',
        label: 'Plintus',
        icon: <Ruler size={19} strokeWidth={1.8} />,
        items: trimItems('skirting'),
      },
      {
        key: 'karniz',
        label: 'Karniz',
        icon: <Frame size={19} strokeWidth={1.8} />,
        items: trimItems('cornice'),
      },
    ]
  }, [
    userFurniture, catalogFurniture, furniture, wallpapers, lights, geometry,
    placeFurniture, addLight, setWallCovering, selectedWall, openPanelAt,
    setDesignState, floorType, floorTexture, floorPattern,
  ])
}
