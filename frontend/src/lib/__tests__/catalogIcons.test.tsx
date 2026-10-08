import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LIGHT_TYPES } from '../lightCatalog'
import { FurnitureSymbol, LightSymbol } from '../catalogIcons'

const svgOf = (ui: React.ReactElement) => render(<svg>{ui}</svg>).container.querySelector('svg svg')

describe('LightSymbol', () => {
  it('draws an icon for every kind of light in the catalog, none of them the same as the fallback by accident', () => {
    for (const t of LIGHT_TYPES) expect(svgOf(<LightSymbol type={t.id} />), t.id).not.toBeNull()
  })

  it('draws something for a kind it does not know rather than nothing', () => {
    expect(svgOf(<LightSymbol type="from-the-future" />)).not.toBeNull()
  })

  it('can sit inside a plan drawn in millimetres: position and size reach the svg', () => {
    const svg = svgOf(<LightSymbol type="pendant" x={100} y={200} width={230} height={230} />)!
    expect(svg.getAttribute('x')).toBe('100')
    expect(svg.getAttribute('y')).toBe('200')
    expect(svg.getAttribute('width')).toBe('230')
  })

  it('is hidden from screen readers: the name beside it says what it is', () => {
    expect(svgOf(<LightSymbol type="bra" />)!.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('FurnitureSymbol', () => {
  it.each(['🍽️', '🛋️', '🏪', '📦', '🧩'])('draws an icon for the marker %s', (marker) => {
    expect(svgOf(<FurnitureSymbol emoji={marker} />)).not.toBeNull()
  })

  it('tells the kinds apart', () => {
    const a = svgOf(<FurnitureSymbol emoji="🛋️" />)!.innerHTML
    const b = svgOf(<FurnitureSymbol emoji="🏪" />)!.innerHTML
    expect(a).not.toBe(b)
  })

  it('draws a plain box for a missing or unknown marker', () => {
    const box = svgOf(<FurnitureSymbol emoji="📦" />)!.innerHTML
    expect(svgOf(<FurnitureSymbol emoji={undefined} />)!.innerHTML).toBe(box)
    expect(svgOf(<FurnitureSymbol emoji="???" />)!.innerHTML).toBe(box)
  })
})
