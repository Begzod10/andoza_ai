/**
 * The studio's buttons went missing on a phone: a pinch that landed on the
 * page rather than the 3D view zoomed the whole page, pushing the bottom row
 * and the ⋮ menu off screen. While the studio is open the page itself does
 * not pinch-zoom; scrolling still works, and other pages keep their zoom.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { useNoPageZoom } from './useNoPageZoom'

function Studio() { useNoPageZoom(); return null }

describe('useNoPageZoom', () => {
  it('stops the page pinch-zooming while mounted, keeping scrolling', () => {
    document.body.style.touchAction = ''
    const { unmount } = render(<Studio />)
    expect(document.body.style.touchAction).toBe('pan-x pan-y')
    unmount()
    expect(document.body.style.touchAction).toBe('')
  })

  it('puts back whatever the page had before', () => {
    document.body.style.touchAction = 'manipulation'
    const { unmount } = render(<Studio />)
    unmount()
    expect(document.body.style.touchAction).toBe('manipulation')
    document.body.style.touchAction = ''
  })
})
