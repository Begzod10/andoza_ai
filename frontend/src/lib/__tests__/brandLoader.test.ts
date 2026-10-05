import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { BRAND_LOADER_CSS, BRAND_LOADER_HTML } from '@/lib/brandLoader'
import { BrandLoader } from '@/components/BrandLoader'

const INDEX_HTML = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')

describe('brand loader', () => {
  it('is in index.html exactly as in the module, so first paint and the Suspense fallback look the same', () => {
    expect(INDEX_HTML).toContain(BRAND_LOADER_HTML)
    expect(INDEX_HTML).toContain(BRAND_LOADER_CSS)
  })

  it('builds the ladder from its parts and brings eight tools to it', () => {
    for (const part of ['bl-rl', 'bl-rr', 'bl-r1', 'bl-r2', 'bl-r3', 'bl-cap', 'bl-base']) {
      expect(BRAND_LOADER_HTML).toContain(part)
    }
    expect(BRAND_LOADER_HTML.match(/class="bl-tool"/g)).toHaveLength(8)
  })

  it('is announced as a status and stills for reduced motion', () => {
    render(createElement(BrandLoader))
    expect(screen.getByRole('status', { name: 'andoza.ai' })).toBeInTheDocument()
    expect(BRAND_LOADER_CSS).toContain('prefers-reduced-motion')
  })
})
