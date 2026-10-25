import { describe, it, expect } from 'vitest'
import { inferRole, isRole, ROLE_GROUP } from '../furnitureRole'

describe('furniture roles', () => {
  it.each([
    ['boshqa', 'Jun gilam', 'rug'], ['stol', 'Jurnal stoli', 'coffee_table'],
    ['boshqa', 'TV tumba', 'tv_unit'], ['stol', 'Tumbochka', 'nightstand'],
    ['stol', 'Yozuv stoli', 'desk'], ['divan', 'Kreslo Milano', 'armchair'],
    ['shkaf', 'Garderob', 'wardrobe'], ['shkaf', 'Kitob javoni', 'shelf'],
    ['divan', 'Divan Roma', 'sofa'], ['karavot', 'Karavot', 'bed'],
    ['stol', 'Ovqat stoli', 'dining_table'], ['stul', 'Stul', 'dining_chair'],
    ['boshqa', 'Puf', 'decor'],
    ['stul', 'Ish stuli', 'desk_chair'], ['stul', 'Office chair', 'desk_chair'],
    ['kreslo', 'Kompyuter stuli', 'desk_chair'], ['stul', 'Офисное кресло', 'desk_chair'],
    ['divan', 'Kreslo', 'armchair'],
    ['stol', 'Компьютерный стол', 'desk'], ['kreslo', 'Компьютерное кресло', 'desk_chair'],
    ['stul', 'Офисный стул', 'desk_chair'],
  ])('%s / %s is %s', (category, name, role) => {
    expect(inferRole(category, name)).toBe(role)
  })

  it('copes with a missing category', () => {
    expect(inferRole(null, 'Puf')).toBe('decor')
    expect(inferRole(undefined, 'Divan')).toBe('decor')
  })

  it('groups roles', () => {
    expect(ROLE_GROUP.dining_chair).toBe('dining')
    expect(ROLE_GROUP.rug).toBe('extra')
  })

  it('isRole accepts only the 14 roles', () => {
    expect(Object.keys(ROLE_GROUP)).toHaveLength(14)
    expect(isRole('sofa')).toBe(true)
    expect(isRole('throne')).toBe(false)
    expect(isRole(3)).toBe(false)
  })
})
