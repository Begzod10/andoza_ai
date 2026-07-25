import * as React from 'react'
import { nanoid } from 'nanoid'
import { convertFilesToGlb, SUPPORTED_FORMATS } from '@/lib/modelConverter'
import { saveModelToDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { useRoomStore } from '@/store/roomStore'
import { useGLTF } from '@react-three/drei'

export function ModelImportButton({ compact = false }: { compact?: boolean }) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [warn, setWarn] = React.useState<string | null>(null)
  const addUserFurniture = useRoomStore((s) => s.addUserFurniture)

  async function handleFiles(files: File[]) {
    setStatus('loading')
    setWarn(null)
    try {
      const { buffer, info, mainFile } = await convertFilesToGlb(files)

      if (!info.hasTextures) {
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
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : ''
      setWarn(msg || 'Faylni o\'qishda xatolik yuz berdi.')
    }
  }

  const label =
    status === 'loading' ? 'Yuklanmoqda' :
    status === 'done'    ? 'Qo\'shildi'  :
                           'Model yuklash'

  if (compact) {
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={SUPPORTED_FORMATS}
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? [])
            if (fs.length) { handleFiles(fs); e.target.value = '' }
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={status === 'loading'}
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-brand transition-colors px-3 py-2"
        >
          <span className="text-2xl">
            {status === 'loading' ? '⏳' : status === 'done' ? '✅' : '+'}
          </span>
          <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
          <span className="text-[9px] text-gray-400 leading-tight">GLB · GLTF · OBJ · FBX + teksturalar</span>
        </button>
      </>
    )
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={SUPPORTED_FORMATS}
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? [])
          if (fs.length) { handleFiles(fs); e.target.value = '' }
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={status === 'loading'}
        className={`w-full text-xs py-2 border-2 border-dashed rounded-lg transition-colors ${
          status === 'done'
            ? 'border-green-400 text-green-600'
            : status === 'error'
            ? 'border-red-300 text-red-500'
            : 'border-gray-300 text-gray-500 hover:border-brand/50 hover:text-brand'
        }`}
      >
        {status === 'loading' ? 'Yuklanmoqda...' :
         status === 'done'    ? '✓ Qo\'shildi'  :
                                '+ Model qo\'shish (model + teksturalarini birga tanlang)'}
      </button>
      {warn && <p className="text-xs text-amber-600 leading-snug">{warn}</p>}
    </div>
  )
}
