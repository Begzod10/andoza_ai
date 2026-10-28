import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { nanoid } from 'nanoid'
import { getCatalogFurniture, type CatalogFurniture } from '@/lib/api'
import { furniturePlacementMm } from '@/lib/placement'
import { useRoomStore } from '@/store/roomStore'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The shop model the studio was opened to place (`?place=<furniture id>`), or
 *  null. The mobile app opens a room this way from a shop's product page
 *  ("Xonamga qo'yish"). */
export function placeParam(search: string): string | null {
  const raw = new URLSearchParams(search).get('place')
  return raw && UUID_RE.test(raw) ? raw : null
}

/**
 * Places the model named by `?place=` once, as soon as the room is loaded.
 *
 * Waits for `roomReady` (the server's copy is in the store): placing earlier
 * would either be wiped by that load or, by making the store dirty, stop the
 * server's copy from loading at all. The model is added to the store's shop
 * catalog too, and kept there, so the scene can draw it even when it is not
 * among the first page the studio fetched (which replaces that catalog).
 */
export function usePlaceFromLink({
  roomReady,
  onPlaced,
  onFailed,
}: {
  roomReady: boolean
  onPlaced: (item: CatalogFurniture) => void
  onFailed: () => void
}): void {
  const location = useLocation()
  const navigate = useNavigate()
  const [placeId] = useState(() => placeParam(location.search))
  const [placed, setPlaced] = useState<CatalogFurniture | null>(null)
  const done = useRef(false)

  // Drop the param once read: the tab strip carries location.search to the
  // other studio tabs, and a reload must not place the model a second time.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has('place')) return
    params.delete('place')
    const rest = params.toString()
    navigate({ search: rest ? `?${rest}` : '' }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [])

  const { data: item, isError } = useQuery({
    queryKey: ['catalog-furniture', placeId],
    queryFn: () => getCatalogFurniture(placeId!),
    enabled: placeId !== null,
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (done.current || placeId === null) return
    if (isError || (item && !item.glb_url)) {
      done.current = true
      onFailed()
      return
    }
    if (!roomReady || !item) return
    done.current = true
    const s = useRoomStore.getState()
    if (!s.catalogFurniture.some((f) => f.id === item.id)) {
      s.setCatalogFurniture([...s.catalogFurniture, item])
    }
    const sizeM = item.footprint_w && item.footprint_d
      ? { w: item.footprint_w / 100, d: item.footprint_d / 100 }
      : undefined
    s.placeFurniture({
      id: nanoid(),
      furniture_id: item.id,
      rotation: 0,
      ...furniturePlacementMm(s.geometry, s.furniture.length, sizeM),
    })
    setPlaced(item)
    onPlaced(item)
  }, [placeId, item, isError, roomReady, onPlaced, onFailed])

  // The studio's own catalog fetch replaces the list wholesale (and refetches);
  // put the placed model back each time, or it vanishes from the scene.
  useEffect(() => {
    if (!placed) return
    const keep = (list: CatalogFurniture[]) => {
      if (!list.some((f) => f.id === placed.id)) {
        useRoomStore.getState().setCatalogFurniture([...list, placed])
      }
    }
    keep(useRoomStore.getState().catalogFurniture)
    return useRoomStore.subscribe((state) => keep(state.catalogFurniture))
  }, [placed])
}
