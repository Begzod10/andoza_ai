/**
 * A panorama is taken FROM somewhere, not of something: the camera stands in
 * the middle of the room at eye height and turns on the spot. What comes out
 * is equirectangular — 360 degrees across, 180 up and down — which is the one
 * thing every 360 viewer assumes about the file it is handed.
 */
import { describe, it, expect } from 'vitest'
import {
  PANO_EYE_HEIGHT, PANO_WIDTH, PANO_HEIGHT, panoramaSizeFor, flipRows,
} from '../panorama360'

describe('the panorama camera', () => {
  it('stands at eye height, not on a tripod', () => {
    expect(PANO_EYE_HEIGHT).toBeCloseTo(1.65, 10)
  })

  it('is asked for 4000 x 2000', () => {
    expect(PANO_WIDTH).toBe(4000)
    expect(PANO_HEIGHT).toBe(2000)
  })

  it('is 2:1, which is what makes it wrap', () => {
    // 360 across and 180 up and down. Any other ratio and a viewer stretches
    // the room to fit.
    expect(PANO_WIDTH / PANO_HEIGHT).toBe(2)
  })
})

describe('panoramaSizeFor', () => {
  it('takes the full size on a GPU that allows it', () => {
    expect(panoramaSizeFor(8192)).toEqual({ width: 4000, height: 2000 })
    expect(panoramaSizeFor(4096)).toEqual({ width: 4000, height: 2000 })
  })

  it('settles for what a smaller GPU grants rather than failing', () => {
    // Some phones cap textures at 2048; asking for more fails the allocation
    // outright, and no panorama at all is worse than a smaller one.
    expect(panoramaSizeFor(2048)).toEqual({ width: 2048, height: 1024 })
  })

  it('stays 2:1 whatever it settles for', () => {
    for (const max of [1024, 2048, 3000, 4096, 16384]) {
      const { width, height } = panoramaSizeFor(max)
      expect(width / height).toBe(2)
    }
  })

  it('never goes below a usable size', () => {
    expect(panoramaSizeFor(256).width).toBe(1024)
  })
})

describe('flipRows', () => {
  const W = 2, H = 3
  // One distinct colour per row, bottom row first — the order WebGL reads in.
  const pixels = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      pixels[i] = (y + 1) * 10
      pixels[i + 3] = 255
    }
  }

  it('turns the framebuffer the right way up', () => {
    // WebGL reads bottom-up and an image runs top-down; without the flip the
    // room comes out upside down, floor in the sky.
    const out = flipRows(pixels, W, H)
    expect(out[0]).toBe(30)                       // top row was the last read
    expect(out[(2 * W) * 4]).toBe(10)             // bottom row was the first
  })

  it('keeps every pixel it was given', () => {
    expect(flipRows(pixels, W, H).length).toBe(W * H * 4)
  })
})
