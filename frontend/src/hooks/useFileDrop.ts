import * as React from 'react'

/**
 * File drag-and-drop for any element.
 *
 * Spread `dropProps` onto the target and use `isOver` to draw the highlight.
 * Nested children fire their own dragenter/dragleave pairs, so entries are
 * counted rather than toggled — otherwise the highlight flickers off the
 * moment the pointer crosses a child element.
 */
export interface FileDropOptions {
  /** Called with the accepted files that were dropped. */
  onDrop(files: File[]): void
  /** Keep only the files this returns true for (checked on drop). */
  accept?(file: File): boolean
  /**
   * Restrict which drags light the zone up. The browser hides filenames until
   * the drop, but MIME types are readable during the drag — so image zones can
   * ignore a model being dragged past, and vice versa.
   */
  dragKind?: 'image' | 'non-image' | 'any'
  disabled?: boolean
}

function draggingFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

function matchesKind(e: React.DragEvent, kind: FileDropOptions['dragKind']): boolean {
  if (!kind || kind === 'any') return true
  const items = Array.from(e.dataTransfer?.items ?? []).filter((i) => i.kind === 'file')
  // No item metadata (some browsers on dragenter) — stay permissive.
  if (items.length === 0) return true
  const anyImage = items.some((i) => i.type.startsWith('image/'))
  return kind === 'image' ? anyImage : !anyImage
}

export function useFileDrop({ onDrop, accept, dragKind, disabled }: FileDropOptions) {
  const [isOver, setIsOver] = React.useState(false)
  const depth = React.useRef(0)

  const clear = React.useCallback(() => {
    depth.current = 0
    setIsOver(false)
  }, [])

  const active = (e: React.DragEvent) => !disabled && draggingFiles(e) && matchesKind(e, dragKind)

  const dropProps = {
    onDragEnter(e: React.DragEvent) {
      if (!active(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth.current += 1
      setIsOver(true)
    },
    onDragOver(e: React.DragEvent) {
      if (!active(e)) return
      // Without preventDefault the browser refuses the drop and opens the file.
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave(e: React.DragEvent) {
      if (!active(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth.current -= 1
      if (depth.current <= 0) clear()
    },
    onDrop(e: React.DragEvent) {
      if (!active(e)) return
      e.preventDefault()
      e.stopPropagation()
      clear()
      const files = Array.from(e.dataTransfer.files ?? [])
      const picked = accept ? files.filter(accept) : files
      if (picked.length > 0) onDrop(picked)
    },
  }

  return { isOver, dropProps }
}

/** Files the model importer understands (model + its side-car textures). */
export const MODEL_FILE_RE = /\.(glb|gltf|obj|fbx|bin|mtl|png|jpe?g|webp|bmp|tga|ktx2)$/i
/** A model container itself — used to tell "a model was dropped" from "an image was dropped". */
export const MODEL_MAIN_RE = /\.(glb|gltf|obj|fbx)$/i

export const isModelFile = (f: File) => MODEL_FILE_RE.test(f.name)
export const isImageFile = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/i.test(f.name)
