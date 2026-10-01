import { describe, it, expect, vi, afterEach } from 'vitest'
import { panoramaJpeg, snapPanoramaCanvas, SNAP_EVENT, type SnapRequest } from '../panoramaSnap'

afterEach(() => vi.useRealTimers())

function answerWith(canvas: HTMLCanvasElement | null) {
  const handler = (e: Event) => (e as CustomEvent<SnapRequest>).detail.resolve(canvas)
  window.addEventListener(SNAP_EVENT, handler)
  return () => window.removeEventListener(SNAP_EVENT, handler)
}

function canvasWith(sizes: number[]) {
  // A canvas whose JPEG gets smaller each time the quality drops.
  const calls: number[] = []
  const canvas = {
    toBlob: (cb: (b: Blob | null) => void, _type: string, q: number) => {
      calls.push(q)
      cb(new Blob([new Uint8Array(sizes[Math.min(calls.length - 1, sizes.length - 1)])]))
    },
  } as unknown as HTMLCanvasElement
  return { canvas, calls }
}

describe('snapPanoramaCanvas', () => {
  it("gets the canvas from whoever answers the scene's event", async () => {
    const canvas = document.createElement('canvas')
    const off = answerWith(canvas)
    await expect(snapPanoramaCanvas()).resolves.toBe(canvas)
    off()
  })

  it('gives up with null when nothing answers (the 3D page is not open)', async () => {
    vi.useFakeTimers()
    const p = snapPanoramaCanvas(5000)
    await vi.advanceTimersByTimeAsync(5001)
    await expect(p).resolves.toBeNull()
  })

  it('takes the first answer only', async () => {
    const first = document.createElement('canvas')
    const off1 = answerWith(first)
    const off2 = answerWith(document.createElement('canvas'))
    await expect(snapPanoramaCanvas()).resolves.toBe(first)
    off1(); off2()
  })
})

describe('panoramaJpeg', () => {
  it('sends the first quality that fits under the upload limit', async () => {
    const { canvas, calls } = canvasWith([1_000_000])
    const off = answerWith(canvas)
    const blob = await panoramaJpeg()
    off()
    expect(blob?.size).toBe(1_000_000)
    expect(calls).toEqual([0.92])
  })

  it('compresses harder until a big panorama fits, rather than refusing it', async () => {
    const { canvas, calls } = canvasWith([9_000_000, 8_000_000, 6_000_000])
    const off = answerWith(canvas)
    const blob = await panoramaJpeg()
    off()
    expect(blob?.size).toBe(6_000_000)
    expect(calls).toEqual([0.92, 0.85, 0.75])
  })

  it('returns null if even the lowest quality is too big, or there is no scene to ask', async () => {
    const { canvas } = canvasWith([20_000_000])
    const off = answerWith(canvas)
    await expect(panoramaJpeg()).resolves.toBeNull()
    off()
    const off2 = answerWith(null)
    await expect(panoramaJpeg()).resolves.toBeNull()
    off2()
  })
})
