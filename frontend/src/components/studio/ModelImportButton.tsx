import * as React from 'react'
import { nanoid } from 'nanoid'
import { convertFilesToGlb, SUPPORTED_FORMATS } from '@/lib/modelConverter'
import { saveModelToDb, arrayBufferToBlobUrl } from '@/lib/modelDb'
import { useRoomStore } from '@/store/roomStore'
import { useGLTF } from '@react-three/drei'

const IMPORT_EXTS = /\.(glb|gltf|obj|fbx|bin|mtl|png|jpe?g|webp|bmp|tga|ktx2)$/i

export function ModelImportButton({ compact = false }: { compact?: boolean }) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const folderRef = React.useRef<HTMLInputElement>(null)
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [warn, setWarn] = React.useState<string | null>(null)
  const addUserFurniture = useRoomStore((s) => s.addUserFurniture)

  // Folder pick: take every relevant file inside (textures may live in
  // subfolders like textures/) — this is "load textures from the model's
  // folder" done the only way a browser allows
  function onFolderPicked(list: FileList | null) {
    const fs = Array.from(list ?? []).filter((f) => IMPORT_EXTS.test(f.name)).slice(0, 400)
    if (fs.length) handleFiles(fs)
  }

  async function handleFiles(files: File[]) {
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
        <input
          ref={folderRef}
          type="file"
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          onChange={(e) => { onFolderPicked(e.target.files); e.target.value = '' }}
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
        <button
          onClick={() => folderRef.current?.click()}
          disabled={status === 'loading'}
          className="w-full text-[10px] font-medium text-gray-400 hover:text-brand transition-colors py-1"
          title="Model papkasini tanlang — teksturalar ichidagi papkalardan ham yuklanadi"
        >
          📁 Papka orqali yuklash
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
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => { onFolderPicked(e.target.files); e.target.value = '' }}
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
      <button
        onClick={() => folderRef.current?.click()}
        disabled={status === 'loading'}
        className="w-full text-xs py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-brand/50 hover:text-brand transition-colors"
        title="Model papkasini tanlang — teksturalar ichidagi papkalardan ham yuklanadi"
      >
        📁 Papka orqali yuklash (teksturalar bilan)
      </button>
      {warn && <p className="text-xs text-amber-600 leading-snug">{warn}</p>}
    </div>
  )
}
