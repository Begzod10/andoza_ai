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
import { Sofa, Lightbulb, Wallpaper } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { listWallpapers, type Wallpaper as WallpaperEntry } from '@/lib/api'
import { LIGHT_TYPES } from '@/lib/lightCatalog'
import { nextFurnitureOffsetMm, nextLightPositionMm } from '@/lib/placement'
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
          ...nextFurnitureOffsetMm(furniture.filter((f) => f.furniture_id === e.id).length),
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
          ...nextFurnitureOffsetMm(furniture.filter((x) => x.furniture_id === f.id).length),
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
    ]
  }, [
    userFurniture, catalogFurniture, furniture, wallpapers, lights, geometry,
    placeFurniture, addLight, setWallCovering, selectedWall, openPanelAt,
  ])
}

/** Which phase's panel a category opens when its items overflow the arc. */
export const ARC_CATEGORY_PHASE: Record<string, 'boyoq' | 'chiroq' | 'mebel'> = {
  mebel: 'mebel',
  rang: 'boyoq',
  chiroq: 'chiroq',
}
