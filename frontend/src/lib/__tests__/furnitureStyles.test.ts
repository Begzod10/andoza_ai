import { describe, it, expect } from 'vitest'
import { knownStyles } from '../furnitureStyles'

describe('knownStyles', () => {
  it('keeps only the styles the app knows, in the order given', () => {
    expect(knownStyles(['milliy', 'barokko', 'hitech'])).toEqual(['milliy', 'hitech'])
  })
  it('a model with no styles (or an old one without the field) has none', () => {
    expect(knownStyles(undefined)).toEqual([])
    expect(knownStyles([])).toEqual([])
  })
})
