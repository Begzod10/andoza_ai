/** Material-slot labels in the furniture catalog are keys, translated at render. */
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { FURNITURE_CATALOG } from '@/lib/furnitureCatalog'

const slots = FURNITURE_CATALOG.flatMap((f) => f.materialSlots ?? [])

describe('furniture material slots', () => {
  it('carry a labelKey instead of a fixed Uzbek label', () => {
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(s).toHaveProperty('labelKey')
      expect(s).not.toHaveProperty('label')
    }
  })

  it('translate every slot label into each language', () => {
    for (const s of slots) {
      for (const lng of ['uz', 'ru', 'en']) {
        const text = i18n.t((s as { labelKey: never }).labelKey, { lng })
        expect(text).not.toBe((s as { labelKey: string }).labelKey)
      }
    }
    const wood = slots.find((s) => s.name === 'Wood') as unknown as { labelKey: never }
    expect(i18n.t(wood.labelKey, { lng: 'uz' })).toBe("Yog'och")
    expect(i18n.t(wood.labelKey, { lng: 'ru' })).toBe('Дерево')
    expect(i18n.t(wood.labelKey, { lng: 'en' })).toBe('Wood')
  })
})
