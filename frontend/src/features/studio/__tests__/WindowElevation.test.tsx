/**
 * The elevation is drawn in a ~1-unit viewBox, so stroke widths only make
 * sense as non-scaling hairlines. `vector-effect` is NOT inherited: when it
 * sat on the <svg>/<g> instead of the shapes, every line was stroked at 1
 * USER unit — ~80% of the drawing's width — and the thumbnails filled in
 * solid dark. Pin it on the shapes themselves.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WindowElevation } from '../WindowElevation'
import { WINDOW_STYLES } from '@/lib/windowStyles'

describe('WindowElevation', () => {
  it('marks every stroked shape non-scaling, for every style', () => {
    for (const style of WINDOW_STYLES) {
      const html = renderToStaticMarkup(<WindowElevation style={style} strokeWidth={1} />)
      const shapes = html.match(/<(rect|line|path)\b[^>]*>/g) ?? []

      expect(shapes.length, `${style.id} drew nothing`).toBeGreaterThan(0)
      const bare = shapes.filter((tag) => !tag.includes('vector-effect="non-scaling-stroke"'))
      expect(bare, `${style.id}: stroked in user units`).toEqual([])
    }
  })
})
