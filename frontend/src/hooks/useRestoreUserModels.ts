import { useEffect, useRef } from 'react'
import { useRoomStore } from '@/store/roomStore'
import { getModelFromDb, saveModelToDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { listUserModels } from '@/lib/api'
import type { FurnitureCategory, FurniturePlacement } from '@/lib/furnitureCatalog'
import { useGLTF } from '@react-three/drei'

/**
 * On startup, bring the user's imported models back to life.
 *
 * Two restore paths, tried in order per entry:
 *  1. IndexedDB — the local copy saved at import time (blob URLs expire on
 *     refresh, so the URL is recreated from the stored bytes).
 *  2. The server copy (entry.remoteUrl) — when site data was cleared, the
 *     bytes are fetched back and re-cached into IndexedDB.
 *
 * Separately, the server list is merged in once per session: models imported
 * on another device (or before localStorage was cleared) have no local entry
 * at all, and reappear on the "Mening" shelf from their server rows.
 */
export function useRestoreUserModels() {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const addUserFurniture = useRoomStore((s) => s.addUserFurniture)
  const setUserFurniturePath = useRoomStore((s) => s.setUserFurniturePath)
  const mergedRef = useRef(false)

  // Reactive: room switches can reload userFurniture entries with empty
  // modelPath (blob URLs never survive persistence) — restore whenever any
  // entry is missing its live URL, not only on first mount.
  useEffect(() => {
    for (const entry of userFurniture) {
      if (entry.modelPath) continue  // already live
      getModelFromDb(entry.blobId).then(async (buffer) => {
        if (!buffer && entry.remoteUrl) {
          // Local copy gone — pull the durable one back and re-cache it.
          try {
            const res = await fetch(entry.remoteUrl)
            if (res.ok) {
              buffer = await res.arrayBuffer()
              saveModelToDb(entry.blobId, buffer).catch(() => {})
            }
          } catch {
            return  // offline or the file is gone; leave the entry dormant
          }
        }
        if (!buffer) return
        const url = arrayBufferToBlobUrl(buffer)
        useGLTF.preload(url)
        setUserFurniturePath(entry.id, url)
      })
    }
  }, [userFurniture, setUserFurniturePath])

  // Server merge — once per mount of the panel tree. Entries already known
  // locally (matched by serverId, or by id for entries created from a server
  // row) are left alone; only truly unknown rows are added.
  useEffect(() => {
    if (mergedRef.current) return
    mergedRef.current = true
    listUserModels()
      .then((models) => {
        // Read the list at resolve time, not capture time — imports may have
        // landed while the request was in flight.
        const current = useRoomStore.getState().userFurniture
        const known = new Set<string>()
        for (const f of current) {
          if (f.serverId) known.add(f.serverId)
          known.add(f.id)
        }
        for (const m of models) {
          if (known.has(m.id)) continue
          addUserFurniture({
            id: m.id,
            name: m.name,
            emoji: '📦',
            blobId: m.id,
            modelPath: '',  // restored lazily by the effect above via remoteUrl
            serverId: m.id,
            remoteUrl: m.url,
            thumbnailUrl: m.thumbnail_url ?? undefined,
            scale: m.scale,
            sizeM: { w: m.size_w_m, d: m.size_d_m, h: m.size_h_m },
            hasTextures: m.has_textures,
            category: (m.category as FurnitureCategory | null) ?? undefined,
            placement: (m.placement as FurniturePlacement | null) ?? undefined,
            priceUzs: m.price_uzs ?? undefined,
          })
        }
      })
      .catch(() => {})  // logged out or offline — the local flow still works
  }, [addUserFurniture])
}
