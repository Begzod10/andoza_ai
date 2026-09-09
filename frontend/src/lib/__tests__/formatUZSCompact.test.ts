import { describe, it, expect } from 'vitest'
import { formatUZSCompact } from '../utils'

describe('formatUZSCompact', () => {
  it('formats millions with no decimal when exact', () => {
    expect(formatUZSCompact(61_000_000)).toBe("61 mln so'm")
  })

  it('formats millions with one decimal when not a round million', () => {
    expect(formatUZSCompact(60_500_000)).toBe("60.5 mln so'm")
  })

  it('rounds a near-whole-million value up to the round number', () => {
    // 60 987 000 -> 60.987 mln, rounds to the nearest 0.1 -> 61.0 -> "61"
    expect(formatUZSCompact(60_987_000)).toBe("61 mln so'm")
  })

  it('formats thousands as "ming"', () => {
    expect(formatUZSCompact(850_000)).toBe("850 ming so'm")
  })

  it('falls back to the full formatter below 1 000', () => {
    expect(formatUZSCompact(500)).toBe("500 soʻm")
  })

  it('rounds to the nearest 100k within the millions band', () => {
    // 1 249 000 -> 1.2 mln (rounds to nearest 0.1 mln)
    expect(formatUZSCompact(1_249_000)).toBe("1.2 mln so'm")
  })
})
