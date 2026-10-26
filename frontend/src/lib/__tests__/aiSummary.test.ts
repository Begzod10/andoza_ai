import { describe, it, expect } from 'vitest'
import { summaryWithout } from '../aiSummary'

// Summaries from the AI designer eval: each names a piece the layout then had to leave out.
const BEDROOM = "Devorlar och ko'k rangda bo'yaladi. Pol — parket, yelkan terishda. Yoritish: shift chirog'i, torsher. "
  + 'Mebel: ZZ Karavot Grafit 180, ZZ Kiyim shkafi Grafit, ZZ Tumbochka Grafit, ZZ Pufik, ZZ Ish stuli, ZZ Yozuv stoli Nord.'
const SMALL = "Xonaga yengil va keng ko'rinish beruvchi och kulrang bo'yoq devorlar bilan birga, yog'och naqshli yengil laminat pol tanlandi. "
  + "Asosiy yorug'lik sifatida shift chirog'i, qo'shimcha sifatida devorga o'rnatilgan bra ishlatildi. "
  + "Mebel sifatida bitta tor bir kishilik karavot, Skandinav uslubidagi kiyim shkafi va tor tumbochka tanlandi, joyni samarali ishlatish maqsadida."

describe('summaryWithout', () => {
  it('drops the sentence naming a dropped desk and chair (the bedroom eval)', () => {
    expect(summaryWithout(BEDROOM, [{ name: 'ZZ Ish stuli', role: 'desk_chair' }, { name: 'ZZ Yozuv stoli Nord', role: 'desk' }]))
      .toBe("Devorlar och ko'k rangda bo'yaladi. Pol — parket, yelkan terishda. Yoritish: shift chirog'i, torsher.")
  })

  it('drops the sentence naming a dropped wardrobe by its kind, not its name (the small-room eval)', () => {
    expect(summaryWithout(SMALL, [{ name: 'ZZ Kiyim shkafi Nord', role: 'wardrobe' }])).toBe(
      "Xonaga yengil va keng ko'rinish beruvchi och kulrang bo'yoq devorlar bilan birga, yog'och naqshli yengil laminat pol tanlandi. "
      + "Asosiy yorug'lik sifatida shift chirog'i, qo'shimcha sifatida devorga o'rnatilgan bra ishlatildi.",
    )
  })

  it('keeps the summary as it is with nothing dropped', () => {
    expect(summaryWithout(SMALL, [])).toBe(SMALL)
  })

  it('keeps the whole summary when every sentence would go', () => {
    expect(summaryWithout('Divan va kreslo qo\'yildi.', [{ name: 'Divan', role: 'sofa' }])).toBe("Divan va kreslo qo'yildi.")
  })

  it('a decimal or an apostrophe does not end a sentence', () => {
    const text = "Xona 3.5 m kenglikda, devorlar to'q ko'k. Burchakda divan turadi. Pol yog'och."
    expect(summaryWithout(text, [{ name: 'ZZ Divan Oslo', role: 'sofa' }])).toBe("Xona 3.5 m kenglikda, devorlar to'q ko'k. Pol yog'och.")
  })

  it('a role word counts only as a whole word start and only for its role', () => {
    const text = 'Tumbochka karavot yonida. Ovqat stoli oshxonada. Kitob javoni burchakda.'
    // "tumba" is a TV stand, not the start of "tumbochka".
    expect(summaryWithout(text, [{ name: 'TV tumba', role: 'tv_unit' }])).toBe(text)
    // A dining table is not named by "stol": only a desk is.
    expect(summaryWithout(text, [{ name: 'Katta stol', role: 'dining_table' }])).toBe(text)
    expect(summaryWithout(text, [{ name: 'Yozuv stoli', role: 'desk' }])).toBe('Tumbochka karavot yonida. Kitob javoni burchakda.')
    // A nightstand has no role word: only its full name names it.
    expect(summaryWithout(text, [{ name: 'Tumbochka Nord', role: 'nightstand' }])).toBe(text)
  })

  it('finds a full catalog name whatever its case, and works with no role at all', () => {
    const text = 'Devorlar oq. Mebel: zz pufik va gilam.'
    expect(summaryWithout(text, [{ name: 'ZZ Pufik' }])).toBe('Devorlar oq.')
  })
})
