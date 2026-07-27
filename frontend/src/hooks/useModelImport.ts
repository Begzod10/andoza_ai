import * as React from 'react'
import { nanoid } from 'nanoid'
import { useGLTF } from '@react-three/drei'
import { convertFilesToGlb } from '@/lib/modelConverter'
import { saveModelToDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { useRoomStore } from '@/store/roomStore'

export type ImportStatus = 'idle' | 'loading' | 'done' | 'error'

/**
 * Shared model-import pipeline: convert whatever the user gave us to a GLB,
 * persist it, and register it as a user furniture entry. Used by the import
 * button and by every drop zone, so a dropped model behaves exactly like a
 * picked one.
 */
export function useModelImport() {
  const [status, setStatus] = React.useState<ImportStatus>('idle')
  const [warn, setWarn] = React.useState<string | null>(null)
  const addUserFurniture = useRoomStore((s) => s.addUserFurniture)

  /** Returns the new entry id, or null when the import failed. */
  const importFiles = React.useCallback(
    async (files: File[]): Promise<string | null> => {
      setStatus('loading')
      setWarn(null)
      try {
        const { buffer, info, mainFile, missingTextures } = await convertFilesToGlb(files)

        if (missingTextures.length > 0) {
          // Name the exact files the model asked for but the pick didn't include
          const names =
            missingTextures.slice(0, 6).join(', ') +
            (missingTextures.length > 6 ? '…' : '')
          setWarn(
            `Model quyidagi tekstura fayllarini so'raydi: ${names}. ` +
            `Ularni model bilan birga tanlang yoki papka orqali yuklang.`,
          )
        } else if (!info.hasTextures) {
          setWarn(
            `Teksturalar topilmadi (${info.materialCount} material, faqat rang). ` +
            `Model faylini teksturalari bilan BIRGA tanlang (Ctrl bosib bir nechta fayl).`,
          )
        }

        const id = nanoid()
        await saveModelToDb(id, buffer)
        const modelPath = arrayBufferToBlobUrl(buffer)
        useGLTF.preload(modelPath)

        const baseName = mainFile.name.replace(/\.(glb|gltf|obj|fbx)$/i, '').replace(/_/g, ' ')
        addUserFurniture({
          id,
          name: baseName,
          emoji: '📦',
          blobId: id,
          modelPath,
          scale: info.scale,
          sizeM: info.sizeM,
          hasTextures: info.hasTextures,
        })

        setStatus('done')
        setTimeout(() => setStatus('idle'), 1500)
        return id
      } catch (err) {
        setStatus('error')
        setWarn(err instanceof Error && err.message ? err.message : "Faylni o'qishda xatolik yuz berdi.")
        return null
      }
    },
    [addUserFurniture],
  )

  return { importFiles, status, warn, setWarn }
}
