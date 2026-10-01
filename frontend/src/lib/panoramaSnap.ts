/**
 * Asking the 3D scene for a panorama of the room from outside it.
 *
 * The renderer and the scene live inside the <Canvas>; the render sheet does
 * not. So the sheet asks by event and the scene answers, the same shape the 360
 * camera's own button uses. Nobody listening (the 3D page is not mounted) is
 * an answer too: null, after a short wait.
 */
export const SNAP_EVENT = 'andoza:snap-360'

export interface SnapRequest {
  resolve(canvas: HTMLCanvasElement | null): void
}

/** The panorama as a canvas, or null if the scene did not answer. */
export function snapPanoramaCanvas(timeoutMs = 15000): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (canvas: HTMLCanvasElement | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(canvas)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    window.dispatchEvent(new CustomEvent<SnapRequest>(SNAP_EVENT, { detail: { resolve: finish } }))
  })
}

// What the render endpoint takes: 7 MB a file, so a 4000 x 2000 picture gets
// compressed harder until it fits instead of being refused.
const MAX_BYTES = 6.5 * 1024 * 1024
const QUALITIES = [0.92, 0.85, 0.75, 0.65, 0.5]

/** The panorama as a JPEG small enough to send for rendering, or null. */
export async function panoramaJpeg(): Promise<Blob | null> {
  const canvas = await snapPanoramaCanvas()
  if (!canvas) return null
  let last: Blob | null = null
  for (const q of QUALITIES) {
    last = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
    if (last && last.size <= MAX_BYTES) return last
  }
  return last && last.size <= MAX_BYTES ? last : null
}
