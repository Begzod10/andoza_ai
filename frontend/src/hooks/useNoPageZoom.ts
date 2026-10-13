import { useEffect } from 'react'

/**
 * Stops the PAGE from pinch-zooming while the calling screen is open.
 *
 * In the studio a two-finger pinch is meant for the 3D view. One that landed
 * on the header, an overlay button or a sheet zoomed the whole page instead,
 * pushing the bottom row (camera, lock, arc menu) and the ⋮ menu off screen —
 * "where are camera, lock and arrow buttons".
 *
 * `touch-action: pan-x pan-y` on the body leaves one-finger scrolling alone
 * (panels and sheets still scroll) and drops only pinch and double-tap zoom.
 * It is set on the body rather than the studio's own root so the sheets and
 * menus portalled out to the body are covered too; the canvas keeps its own
 * `touch-action: none`, so pinching the room still zooms the room. Put back
 * on the way out, so every other page zooms as before.
 */
export function useNoPageZoom(): void {
  useEffect(() => {
    const body = document.body
    const before = body.style.touchAction
    body.style.touchAction = 'pan-x pan-y'
    return () => { body.style.touchAction = before }
  }, [])
}
