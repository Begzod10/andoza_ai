import { useEffect } from 'react'
import { useRoomStore } from '@/store/roomStore'
import { getModelFromDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { useGLTF } from '@react-three/drei'

/** On startup, recreate blob URLs for any user-imported models (they expire on page refresh). */
export function useRestoreUserModels() {
  const userFurniture = useRoomStore((s) => s.userFurniture)
  const setUserFurniturePath = useRoomStore((s) => s.setUserFurniturePath)

  // Reactive: room switches can reload userFurniture entries with empty
  // modelPath (blob URLs never survive persistence) — restore whenever any
  // entry is missing its live URL, not only on first mount.
  useEffect(() => {
    for (const entry of userFurniture) {
      if (entry.modelPath) continue  // already live
      getModelFromDb(entry.blobId).then((buffer) => {
        if (!buffer) return
        const url = arrayBufferToBlobUrl(buffer)
        useGLTF.preload(url)
        setUserFurniturePath(entry.id, url)
      })
    }
  }, [userFurniture, setUserFurniturePath])
}
