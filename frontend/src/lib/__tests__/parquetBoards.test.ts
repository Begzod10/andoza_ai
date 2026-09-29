/**
 * A real floor is not one plank photographed a thousand times. These are the
 * twelve boards it is dealt from, and the rule for which plank gets which.
 */
import { describe, it, expect } from 'vitest'
import { PARQUET_BOARDS, parquetBoardsFor, boardIndexAt } from '../parquetBoards'

describe('the board set', () => {
  it('is twelve distinct boards', () => {
    expect(PARQUET_BOARDS).toHaveLength(12)
    expect(new Set(PARQUET_BOARDS).size).toBe(12)
  })
})

describe('parquetBoardsFor', () => {
  it('lays boards on a parquet and a laminate', () => {
    expect(parquetBoardsFor('parquet', null)).toHaveLength(12)
    expect(parquetBoardsFor('laminate', null)).toHaveLength(12)
    // The schema default is parquet, so an unset floor is boards too.
    expect(parquetBoardsFor(undefined, null)).toHaveLength(12)
  })

  it('leaves tile and concrete alone — boards are for boards', () => {
    expect(parquetBoardsFor('tile', null)).toEqual([])
    expect(parquetBoardsFor('concrete', null)).toEqual([])
  })

  it('stands aside for an image the user chose', () => {
    // Their pick is the whole floor, not one board among twelve.
    expect(parquetBoardsFor('parquet', '/media/their-oak.jpg')).toEqual([])
  })
})

describe('boardIndexAt', () => {
  it('always names a board in the set', () => {
    for (let i = 0; i < 400; i++) {
      const b = boardIndexAt(i * 0.13 - 3, i * 0.29 - 5, 12)
      expect(Number.isInteger(b)).toBe(true)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(12)
    }
  })

  it('gives the same plank the same board every time', () => {
    // Otherwise the floor reshuffles on every re-render.
    expect(boardIndexAt(1.25, -0.5, 12)).toBe(boardIndexAt(1.25, -0.5, 12))
  })

  it('deals all twelve out across a floor', () => {
    const seen = new Set<number>()
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) {
      seen.add(boardIndexAt(x * 0.15, z * 1.2, 12))
    }
    expect(seen.size).toBe(12)
  })

  it('does not walk through the boards in order along a row', () => {
    // Neighbours stepping 0,1,2,3… would read as a stripe, not as a floor.
    const row = Array.from({ length: 10 }, (_, i) => boardIndexAt(i * 0.15, 0, 12))
    const ascending = row.every((b, i) => i === 0 || b === (row[i - 1] + 1) % 12)
    expect(ascending).toBe(false)
  })

  it('is a no-op for a floor laid from one image', () => {
    expect(boardIndexAt(3, 4, 1)).toBe(0)
  })
})
