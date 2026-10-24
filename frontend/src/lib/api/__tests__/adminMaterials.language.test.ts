import { describe, it, expect, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import i18n, { applyLanguage } from '@/i18n'
import ru from '@/i18n/locales/ru.json'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS, PACK_UNITS, SMETA_KEYS } from '../adminMaterials'
import { optionLabel, smetaKeyLabel, smetaLabel } from '@/pages/dokon/admin/materialLabels'
import { orderStatusLabel, paymentLabel } from '@/lib/orderStatus'

afterEach(() => act(() => applyLanguage('uz')))

describe('admin material labels follow the interface language', () => {
  it('resolve a category, unit, pack unit and estimate key in Russian, and fall back to the id of an unknown one', () => {
    act(() => applyLanguage('ru'))
    const t = i18n.t.bind(i18n)
    expect(optionLabel(MATERIAL_CATEGORIES, 'boyoq', t)).toBe(ru.dokon.admin.category.boyoq)
    expect(optionLabel(MATERIAL_CATEGORIES, 'boyoq', t)).toBe('Краска')
    expect(optionLabel(MATERIAL_UNITS, 'qop', t)).toBe('мешок')
    expect(optionLabel(PACK_UNITS, 'kg', t)).toBe('кг')
    expect(smetaLabel(SMETA_KEYS, 'galtel', t)).toBe('Потолочный плинтус')
    expect(optionLabel(MATERIAL_CATEGORIES, 'unknown', t)).toBe('unknown')
  })

  it('build a light fixture key from the prefix and the fixture name in the current language', () => {
    const pendant = SMETA_KEYS.find((k) => k.id === 'light:pendant')!
    act(() => applyLanguage('ru'))
    expect(smetaKeyLabel(pendant, i18n.t.bind(i18n))).toBe(`Светильник: ${i18n.t(pendant.labelKey)}`)
    act(() => applyLanguage('en'))
    expect(smetaKeyLabel(pendant, i18n.t.bind(i18n))).toMatch(/^Light fixture: /)
    act(() => applyLanguage('uz'))
    expect(smetaKeyLabel(pendant, i18n.t.bind(i18n))).toBe('Chiroq: Osma chiroq')
  })

  it('translate order status and payment labels, leaving an unknown value as it came', () => {
    act(() => applyLanguage('ru'))
    const t = i18n.t.bind(i18n)
    expect(orderStatusLabel('on_the_way', t)).toBe('В пути')
    expect(paymentLabel('cash', t)).toBe('Наличные')
    expect(orderStatusLabel('mystery', t)).toBe('mystery')
  })
})

describe('plural nouns in the shop screens', () => {
  it('use the Russian forms of "модель" and "товар"', () => {
    act(() => applyLanguage('ru'))
    const models = [1, 2, 5, 21].map((count) => i18n.t('dokon.store.models', { count }))
    expect(models).toEqual(['1 модель', '2 модели', '5 моделей', '21 модель'])
    const items = [1, 3, 5].map((count) => i18n.t('dokon.screens.items', { count }))
    expect(items).toEqual(['1 товар', '3 товара', '5 товаров'])
    act(() => applyLanguage('en'))
    expect(i18n.t('dokon.screens.items', { count: 1 })).toBe('1 product')
    expect(i18n.t('dokon.screens.items', { count: 4 })).toBe('4 products')
  })
})
