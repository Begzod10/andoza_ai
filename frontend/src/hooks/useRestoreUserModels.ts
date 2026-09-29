import { useEffect } from 'react'
import { useRoomStore } from '@/store/roomStore'
import { getModelFromDb, saveModelToDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { listUserModels } from '@/lib/api'
import type { FurnitureCategory, FurniturePlacement } from '@/lib/furnitureCatalog'

// The hook is mounted more than once (StudioPage and DesignPanel), so the
// once-only guards live at module scope, not in a ref — two instances racing
// the same server merge is how the shelf once ended up with every model twice.
let mergeStarted = false
const restoreInFlight = new Set<string>()

/**
 * On startup, bring the user's imported models back to life.
 *
 * Two restore paths, tried in order per entry:
 *  1. IndexedDB — the local copy saved at import time (blob URLs expire on
 *     refresh, so the URL is recreated from the stored bytes).
 *  2. The server copy (entry.remoteUrl) — when site data was cleared, the
 *     bytes are fetched back and re-cached into IndexedDB.
 *
 * Restoring means recreating the blob URL only. Deliberately NO
 * useGLTF.preload here: parsing every shelf model up front is minutes of
 * blocked main thread once the shelf holds a dozen real scans (hundreds of
 * MB) — the page froze outright. A model parses when something actually
 * renders it (placement, or the shelf's own 3D preview), which is when the
 * cost buys anything.
 *
 * Separately, the server list is merged in once per session: models imported
 * on another device (or before localStorage was cleared) reappear from their
 * server rows. A server row matching a local entry by name links up instead
 * of duplicating — that heals entries whose serverId link was lost.
 */
export function useRestoreUserModels() {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const setUserFurniturePath = useRoomStore((s) => s.setUserFurniturePath)

  // Reactive: room switches can reload userFurniture entries with empty
  // modelPath (blob URLs never survive persistence) — restore whenever any
  // entry is missing its live URL, not only on first mount.
  useEffect(() => {
    for (const entry of userFurniture) {
      if (entry.modelPath) continue  // already live
      if (restoreInFlight.has(entry.id)) continue
      restoreInFlight.add(entry.id)
      getModelFromDb(entry.blobId)
        .then(async (buffer) => {
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
          setUserFurniturePath(entry.id, arrayBufferToBlobUrl(buffer))
        })
        .finally(() => restoreInFlight.delete(entry.id))
    }
  }, [userFurniture, setUserFurniturePath])

  // Server merge — once per session (module guard: this hook mounts twice).
  useEffect(() => {
    if (mergeStarted) return
    mergeStarted = true
    listUserModels()
      .then((models) => {
        // Read the store at resolve time, not capture time — imports may have
        // landed while the request was in flight.
        const { userFurniture: current, addUserFurniture, setUserFurnitureServer } =
          useRoomStore.getState()
        const byServerId = new Map(current.filter((f) => f.serverId).map((f) => [f.serverId!, f]))
        const byId = new Map(current.map((f) => [f.id, f]))
        for (const m of models) {
          if (byServerId.has(m.id) || byId.has(m.id)) continue
          // Same name, not yet linked → this is the same model whose link was
          // lost (e.g. another tab overwrote localStorage). Relink; don't
          // duplicate — a duplicate has no local bytes and re-downloads the
          // whole GLB on every load.
          const orphan = current.find((f) => !f.serverId && f.name === m.name)
          if (orphan) {
            setUserFurnitureServer(orphan.id, m.id, m.url)
            byServerId.set(m.id, orphan)
            continue
          }
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
        // Heal any duplication a previous double-merge already persisted:
        // a server-created twin (id === server row id) whose row is also
        // linked from a different, original entry.
        const { userFurniture: after, removeUserFurniture } = useRoomStore.getState()
        for (const f of after) {
          const linked = byServerId.get(f.id)
          if (linked && linked.id !== f.id) removeUserFurniture(f.id)
        }
      })
      .catch(() => { mergeStarted = false })  // logged out or offline — retry next mount
  }, [])
}
