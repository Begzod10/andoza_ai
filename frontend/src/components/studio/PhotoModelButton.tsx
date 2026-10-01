import * as React from 'react'
import { uz } from '@/locale/uz'
import { createPhotoModel, fetchPhotoModelGlb, waitForRender, errorMessage } from '@/lib/api'
import { useModelImport } from '@/hooks/useModelImport'
import type { FurnitureCategory } from '@/lib/furnitureCatalog'

type Stage = 'idle' | 'uploading' | 'building' | 'importing' | 'done' | 'error'

// Tripo takes PNG, JPEG and WebP up to 20 MB.
const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 20 * 1024 * 1024

/**
 * "Rasmdan 3D model": a photo of a piece of furniture in, a 3D model in the
 * user's furniture list out. The server builds it (POST /models/from-photo,
 * 1–2 minutes), then the GLB comes through the same import path as an uploaded
 * model — so it is saved, listed and placeable exactly like one.
 *
 * Sits beside ModelImportButton and takes the same `category`, so the model
 * lands under the catalog chip the user has open.
 */
export function PhotoModelButton({ category }: { category?: FurnitureCategory }) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [stage, setStage] = React.useState<Stage>('idle')
  const [error, setError] = React.useState('')
  const { importFiles } = useModelImport()
  const abortRef = React.useRef<AbortController | null>(null)
  const resetRef = React.useRef<number | null>(null)

  React.useEffect(() => () => {
    abortRef.current?.abort()
    if (resetRef.current != null) window.clearTimeout(resetRef.current)
  }, [])

  async function build(photo: File) {
    if (photo.size > MAX_BYTES) {
      setError(uz.photoModel.katta)
      setStage('error')
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError('')
    try {
      setStage('uploading')
      const { job_id } = await createPhotoModel(photo)
      setStage('building')
      const outcome = await waitForRender(job_id, controller.signal)
      setStage('importing')
      const glb = await fetchPhotoModelGlb(outcome.key)
      const id = await importFiles(
        [new File([glb], `${photo.name.replace(/\.[^.]+$/, '') || 'model'}.glb`, { type: 'model/gltf-binary' })],
        category,
      )
      if (!id) throw new Error(uz.photoModel.xato)
      setStage('done')
      resetRef.current = window.setTimeout(() => setStage('idle'), 2500)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(errorMessage(err))
      setStage('error')
    }
  }

  const busy = stage === 'uploading' || stage === 'building' || stage === 'importing'
  const label =
    stage === 'uploading' ? uz.photoModel.yuklanmoqda :
    stage === 'building'  ? uz.photoModel.yaratilmoqda :
    stage === 'importing' ? uz.photoModel.qoshilmoqda :
    stage === 'done'      ? uz.photoModel.tayyor :
                            uz.photoModel.tugma

  return (
    <div className="flex w-full flex-col items-center">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void build(f)
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center gap-1 px-3 py-2 text-gray-400 transition-colors hover:text-brand disabled:opacity-70"
      >
        {busy ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand/20 border-t-brand" aria-hidden />
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" />
            <path d="M12 11l8-4.5M12 11v9M12 11L4 6.5" />
          </svg>
        )}
        <span className="text-center text-[10px] font-medium leading-tight" role={busy ? 'status' : undefined}>{label}</span>
        {stage === 'idle' && (
          <span className="text-center text-[9px] leading-tight text-gray-400">{uz.photoModel.izoh}</span>
        )}
      </button>
      {stage === 'error' && (
        <p role="alert" className="px-2 pb-1 text-center text-[10px] leading-snug text-red-500">
          {uz.photoModel.xato}: {error}
        </p>
      )}
    </div>
  )
}
