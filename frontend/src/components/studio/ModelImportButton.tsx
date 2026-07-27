import * as React from 'react'
import { SUPPORTED_FORMATS } from '@/lib/modelConverter'
import { useModelImport } from '@/hooks/useModelImport'
import { useFileDrop, MODEL_FILE_RE } from '@/hooks/useFileDrop'

export function ModelImportButton({ compact = false }: { compact?: boolean }) {
  const fileRef = React.useRef<HTMLInputElement>(null)
  const folderRef = React.useRef<HTMLInputElement>(null)
  const { importFiles, status, warn } = useModelImport()

  // Folder pick: take every relevant file inside (textures may live in
  // subfolders like textures/) — this is "load textures from the model's
  // folder" done the only way a browser allows
  function onFolderPicked(list: FileList | null) {
    const fs = Array.from(list ?? []).filter((f) => MODEL_FILE_RE.test(f.name)).slice(0, 400)
    if (fs.length) void importFiles(fs)
  }

  const { isOver, dropProps } = useFileDrop({
    onDrop: (files) => void importFiles(files),
    accept: (f) => MODEL_FILE_RE.test(f.name),
    disabled: status === 'loading',
  })

  const label =
    status === 'loading' ? 'Yuklanmoqda' :
    status === 'done'    ? 'Qo\'shildi'  :
                           'Model yuklash'

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={SUPPORTED_FORMATS}
        className="hidden"
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? [])
          if (fs.length) { void importFiles(fs); e.target.value = '' }
        }}
      />
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => { onFolderPicked(e.target.files); e.target.value = '' }}
      />
    </>
  )

  if (compact) {
    return (
      <div
        {...dropProps}
        className={`flex flex-col items-center w-full rounded-lg transition-colors ${
          isOver ? 'bg-brand/10 ring-2 ring-brand ring-inset' : ''
        }`}
      >
        {inputs}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={status === 'loading'}
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-brand transition-colors px-3 py-2"
        >
          <span className="text-2xl">
            {status === 'loading' ? '⏳' : status === 'done' ? '✅' : isOver ? '⬇' : '+'}
          </span>
          <span className="text-[10px] font-medium text-center leading-tight">
            {isOver ? 'Qo\'yib yuboring' : label}
          </span>
          <span className="text-[9px] text-gray-400 leading-tight">Sudrab tashlang · GLB · GLTF · OBJ · FBX</span>
        </button>
        <button
          onClick={() => folderRef.current?.click()}
          disabled={status === 'loading'}
          className="w-full text-[10px] font-medium text-gray-400 hover:text-brand transition-colors py-1"
          title="Model papkasini tanlang — teksturalar ichidagi papkalardan ham yuklanadi"
        >
          📁 Papka orqali yuklash
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5" {...dropProps}>
      {inputs}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={status === 'loading'}
        className={`w-full text-xs py-2 border-2 border-dashed rounded-lg transition-colors ${
          isOver
            ? 'border-brand bg-brand/10 text-brand'
            : status === 'done'
            ? 'border-green-400 text-green-600'
            : status === 'error'
            ? 'border-red-300 text-red-500'
            : 'border-gray-300 text-gray-500 hover:border-brand/50 hover:text-brand'
        }`}
      >
        {isOver                  ? '⬇ Fayllarni qo\'yib yuboring' :
         status === 'loading'    ? 'Yuklanmoqda...' :
         status === 'done'       ? '✓ Qo\'shildi'  :
                                   '+ Model qo\'shish (sudrab tashlang yoki bosing)'}
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
