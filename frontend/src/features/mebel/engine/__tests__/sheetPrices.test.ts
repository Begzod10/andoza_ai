import { describe, it, expect } from 'vitest'
import { computeProject, EMPTY_PRICE_BOOK } from '../index'
import { newProject } from '../model'
import type { FurnitureProject, PriceBook } from '../model'

const SHEETS = { board16: 480000, board18: 556000, back: 120000, mdfM2: 350000 }
const book = (sheets = SHEETS): PriceBook => ({ ...EMPTY_PRICE_BOOK, sheets })
const line = (p: FurnitureProject, prices: PriceBook, label: string, catalog = {}) =>
  computeProject(p, prices, catalog).bom.find(b => b.label === label)

describe('sheet prices in the price book', () => {
  it('prices LDSP by thickness and HDF when no material is chosen', () => {
    const p = newProject('x')
    expect(line(p, book(), 'board_18')).toMatchObject({ unitPrice: 556000 })
    expect(line(p, book(), 'back_4')).toMatchObject({ unitPrice: 120000 })
    // LDSP doors are cut from the same sheets
    expect(line(p, book(), 'facade_18')).toMatchObject({ unitPrice: 556000 })
    p.defaults.board.thickness = 16
    expect(line(p, book(), 'board_16')).toMatchObject({ unitPrice: 480000 })
  })

  it('MDF doors take the price per m²', () => {
    const p = newProject('x')
    p.defaults.facade = { ...p.defaults.facade, kind: 'mdf' }
    expect(line(p, book(), 'facade_mdf')).toMatchObject({ unit: 'm2', unitPrice: 350000 })
  })

  it('a chosen material keeps its own price first', () => {
    const p = newProject('x')
    p.defaults.board.materialId = 'm1'
    expect(line(p, book(), 'board_18', { m1: { name: 'ЛДСП 18x2070x2800', price: 600000 } })).toMatchObject({ unitPrice: 600000 })
    expect(line(p, { ...book(), materials: { m1: 590000 } }, 'board_18')).toMatchObject({ unitPrice: 590000 })
  })

  it('an old price book without sheet prices still leaves them unpriced', () => {
    expect(line(newProject('x'), EMPTY_PRICE_BOOK, 'board_18')).toMatchObject({ unitPrice: null })
  })
})

describe('material thickness check', () => {
  const warn = (p: FurnitureProject, catalog: Record<string, { name: string; price: number }>) =>
    computeProject(p, EMPTY_PRICE_BOOK, catalog).warnings.filter(w => w.code.startsWith('thickness_'))

  it('warns when the chosen sheet is thinner than the setting', () => {
    const p = newProject('x')
    p.defaults.board.materialId = 'm1'
    expect(warn(p, { m1: { name: 'ЛДСП EXTRAVERT Белый 16x2070x2800', price: 1 } }))
      .toEqual([{ code: 'thickness_board', params: { expected: 18, actual: 16 } }])
  })

  it('reads the thickness from either end of the size and from HDF names', () => {
    const p = newProject('x')
    p.defaults.back = { ...p.defaults.back, materialId: 'h1' }
    expect(warn(p, { h1: { name: 'ХДФ Шлифованный Kastamonu 2800Х2070Х3мм', price: 1 } }))
      .toEqual([{ code: 'thickness_back', params: { expected: 4, actual: 3 } }])
  })

  it('says nothing when it matches or the name gives no size', () => {
    const p = newProject('x')
    p.defaults.board.materialId = 'm1'
    expect(warn(p, { m1: { name: 'ЛДСП 18x2070x2800', price: 1 } })).toEqual([])
    expect(warn(p, { m1: { name: 'ЛДСП Белый', price: 1 } })).toEqual([])
  })
})
