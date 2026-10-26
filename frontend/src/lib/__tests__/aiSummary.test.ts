import { describe, it, expect } from 'vitest'
import { SENTENCE_END, summaryWithout } from '../aiSummary'

// Summaries from the AI designer eval: each names a piece the layout then had to leave out.
const BEDROOM = "Devorlar och ko'k rangda bo'yaladi. Pol — parket, yelkan terishda. Yoritish: shift chirog'i, torsher. "
  + 'Mebel: ZZ Karavot Grafit 180, ZZ Kiyim shkafi Grafit, ZZ Tumbochka Grafit, ZZ Pufik, ZZ Ish stuli, ZZ Yozuv stoli Nord.'
const SMALL = "Xonaga yengil va keng ko'rinish beruvchi och kulrang bo'yoq devorlar bilan birga, yog'och naqshli yengil laminat pol tanlandi. "
  + "Asosiy yorug'lik sifatida shift chirog'i, qo'shimcha sifatida devorga o'rnatilgan bra ishlatildi. "
  + "Mebel sifatida bitta tor bir kishilik karavot, Skandinav uslubidagi kiyim shkafi va tor tumbochka tanlandi, joyni samarali ishlatish maqsadida."

describe('summaryWithout', () => {
  it('takes a dropped desk and chair out of the furniture list, keeping the rest of it (the bedroom eval)', () => {
    const kept = ['ZZ Karavot Grafit 180', 'ZZ Kiyim shkafi Grafit', 'ZZ Tumbochka Grafit', 'ZZ Pufik']
    expect(summaryWithout(BEDROOM, [{ name: 'ZZ Ish stuli', role: 'desk_chair' }, { name: 'ZZ Yozuv stoli Nord', role: 'desk' }], kept))
      .toBe("Devorlar och ko'k rangda bo'yaladi. Pol — parket, yelkan terishda. Yoritish: shift chirog'i, torsher. "
        + 'Mebel: ZZ Karavot Grafit 180, ZZ Kiyim shkafi Grafit, ZZ Tumbochka Grafit, ZZ Pufik.')
  })

  it('a furniture list loses its sentence only when no item is left', () => {
    const text = 'Devorlar oq. Mebel: ZZ Divan Oslo va ZZ Kreslo Nord. Pol parket.'
    expect(summaryWithout(text, [{ name: 'ZZ Kreslo Nord', role: 'armchair' }], ['ZZ Divan Oslo'])).toBe('Devorlar oq. Mebel: ZZ Divan Oslo. Pol parket.')
    expect(summaryWithout(text, [{ name: 'ZZ Divan Oslo', role: 'sofa' }, { name: 'ZZ Kreslo Nord', role: 'armchair' }]))
      .toBe('Devorlar oq. Pol parket.')
  })

  it('a list of the plan\'s pieces without "Mebel:" is a list too, and keeps its "va"', () => {
    const text = 'Devorlar oq. ZZ Divan Oslo, ZZ Kreslo Nord, ZZ Gilam va ZZ TV tumba.'
    const kept = ['ZZ Divan Oslo', 'ZZ Gilam', 'ZZ TV tumba']
    expect(summaryWithout(text, [{ name: 'ZZ Kreslo Nord', role: 'armchair' }], kept)).toBe('Devorlar oq. ZZ Divan Oslo, ZZ Gilam va ZZ TV tumba.')
    expect(summaryWithout(text, [{ name: 'ZZ TV tumba', role: 'tv_unit' }], ['ZZ Divan Oslo', 'ZZ Kreslo Nord', 'ZZ Gilam']))
      .toBe('Devorlar oq. ZZ Divan Oslo, ZZ Kreslo Nord va ZZ Gilam.')
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

  it('a name or role word counts only as a whole word, endings and all', () => {
    const text = 'Gilamcha eshik oldida. Divanchalar yo\'q. Divani burchakda.'
    expect(summaryWithout(text, [{ name: 'Gilam', role: 'rug' }])).toBe(text)
    expect(summaryWithout(text, [{ name: 'ZZ Divan Oslo', role: 'sofa' }])).toBe('Gilamcha eshik oldida. Divanchalar yo\'q.')
    expect(summaryWithout('Devorlar oq. Gilamlar polda.', [{ name: 'Gilam' }])).toBe('Devorlar oq.')
  })

  it('a bed is named by "krovat" as well as "karavot"', () => {
    const text = 'Devorlar oq. Ikki kishilik krovat derazaga qaragan.'
    expect(summaryWithout(text, [{ name: 'ZZ Karavot Grafit', role: 'bed' }])).toBe('Devorlar oq.')
  })

  it('"stol" or "shkaf" in a kept piece\'s name does not name a left-out desk or wardrobe', () => {
    const text = 'Devorlar oq. Tuvalet stoli oyna yonida. Kitob shkafi burchakda.'
    const kept = ['Tuvalet stoli', 'Kitob shkafi']
    expect(summaryWithout(text, [{ name: 'Yozuv stoli Nord', role: 'desk' }], kept)).toBe(text)
    expect(summaryWithout(text, [{ name: 'Kiyim shkafi Nord', role: 'wardrobe' }], kept)).toBe(text)
    // Without the kept piece, or with the word said apart from its name (and not as a bare list item),
    // the sentence still goes.
    expect(summaryWithout(text, [{ name: 'Yozuv stoli Nord', role: 'desk' }])).toBe('Devorlar oq. Kitob shkafi burchakda.')
    expect(summaryWithout('Devorlar oq. Tuvalet stoli va yozuv stoli deraza yonida.', [{ name: 'Yozuv stoli Nord', role: 'desk' }], kept))
      .toBe('Devorlar oq.')
    expect(summaryWithout('Devorlar oq. Yozuv stoli deraza yonida.', [{ name: 'Yozuv stoli Nord', role: 'desk' }], kept)).toBe('Devorlar oq.')
  })

  it('finds a full catalog name whatever its case, and works with no role at all', () => {
    const text = 'Devorlar oq. Burchakda zz pufik turadi.'
    expect(summaryWithout(text, [{ name: 'ZZ Pufik' }])).toBe('Devorlar oq.')
  })
})

// From the eval after #70: a sentence listing the placed pieces among other words, and one dropped chair.
const HITECH = "Xonada devorlar oq rangda bo'lib, C devorida qoramtir aksent mavjud. Polni keramika plitka qoplagan, bu hi-tech uslubga mos keladi. "
  + "Yoritishda LED panel markazda, LED trek devor A bo'ylab va spot chiroq devor C uchun tanlandi, bu xona uchun yorqin va zamonaviy yoritishni ta'minlaydi. "
  + 'Mebellar orasida Hi-Tech uslubidagi ZZ Divan Vektor, ZZ TV tumba Glyanets, ZZ Jurnal stoli shisha-metall, shuningdek, loft uslubiga yaqin ZZ Kreslo Indastrial, '
  + "minimalistik ZZ Stul va loft uslubidagi ZZ Stellaj Loft tanlandi, bu xonaga zamonaviy va metall elementlar bilan uyg'unlik beradi."
const MINIMALIST = "Xonada yorqin va toza atmosfera yaratish uchun devorlar oq va yumshoq kulrang aksent bilan bo'yalgan. "
  + "Pol uchun gilam o'rniga toza va oson tozalanuvchi plitka tanlandi. "
  + "Asosiy va yordamchi yorug'lik sifatida LED panel va downlight ishlatildi. "
  + 'Minimalist uslubga mos ravishda ZZ Divan Line, ZZ Jurnal stoli Mono, ZZ Kreslo Soft, ZZ TV tumba Nord va ZZ Stul mebellari tanlandi. '
  + 'Ushbu kombinatsiya zamonaviy va funksional mehmonxona uchun ideal.'
const ILIQ_FURNITURE = "Mebel sifatida zamonaviy uslubdagi divan (ZZ Divan Nova), televizor tumba (ZZ TV tumba Grafit), kreslo (ZZ Kreslo Soft), "
  + "metall-yog'och jurnal stoli (ZZ Jurnal stoli metall-yog'och) va och jigarrang gilam (ZZ Gilam jun och) tanlandi."
const STUL = { name: 'ZZ Stul', role: 'dining_chair' }

describe('summaryWithout: a sentence listing pieces among other words', () => {
  it('hi-tech: its items carry words of their own ("minimalistik ZZ Stul", "shuningdek"), so the sentence goes whole', () => {
    const kept = ['ZZ Divan Vektor', 'ZZ Jurnal stoli shisha-metall', 'ZZ Kreslo Indastrial', 'ZZ TV tumba Glyanets', 'ZZ Stellaj Loft', 'ZZ Pufik']
    const out = summaryWithout(HITECH, [STUL], kept)
    expect(out).toBe(HITECH.split(SENTENCE_END).slice(0, 3).join(' '))
  })

  it('minimalist: the last item goes, the sentence keeps its ending and its "va"', () => {
    const kept = ['ZZ Divan Line', 'ZZ Jurnal stoli Mono', 'ZZ Kreslo Soft', 'ZZ TV tumba Nord', 'ZZ Jurnal stoli eman']
    expect(summaryWithout(MINIMALIST, [STUL], kept)).toBe(MINIMALIST.replace(
      'ZZ Kreslo Soft, ZZ TV tumba Nord va ZZ Stul mebellari tanlandi.', 'ZZ Kreslo Soft va ZZ TV tumba Nord mebellari tanlandi.',
    ))
  })

  it('a first item goes with its piece, the words before it stay', () => {
    const text = 'Devorlar oq. Xonada ZZ Divan Oslo, ZZ Kreslo Nord va ZZ Gilam turadi.'
    expect(summaryWithout(text, [{ name: 'ZZ Divan Oslo', role: 'sofa' }], ['ZZ Kreslo Nord', 'ZZ Gilam']))
      .toBe('Devorlar oq. Xonada ZZ Kreslo Nord va ZZ Gilam turadi.')
  })

  it('a name in brackets after its kind goes with its kind; the list joins with "hamda" too', () => {
    const kept = ['ZZ Divan Nova', 'ZZ TV tumba Grafit', "ZZ Jurnal stoli metall-yog'och", 'ZZ Gilam jun och']
    expect(summaryWithout(ILIQ_FURNITURE, [{ name: 'ZZ Kreslo Soft', role: 'armchair' }], kept)).toBe(
      "Mebel sifatida zamonaviy uslubdagi divan (ZZ Divan Nova), televizor tumba (ZZ TV tumba Grafit), "
      + "metall-yog'och jurnal stoli (ZZ Jurnal stoli metall-yog'och) va och jigarrang gilam (ZZ Gilam jun och) tanlandi.",
    )
    expect(summaryWithout(ILIQ_FURNITURE, [{ name: 'ZZ Kreslo Soft', role: 'armchair' }, { name: 'ZZ Gilam jun och', role: 'rug' }], kept.slice(0, 3))).toBe(
      "Mebel sifatida zamonaviy uslubdagi divan (ZZ Divan Nova), televizor tumba (ZZ TV tumba Grafit) "
      + "va metall-yog'och jurnal stoli (ZZ Jurnal stoli metall-yog'och) tanlandi.",
    )
    const hamda = 'Devorlar oq. Burchakda ZZ Divan Oslo hamda ZZ Kreslo Nord turadi.'
    expect(summaryWithout(hamda, [{ name: 'ZZ Kreslo Nord', role: 'armchair' }], ['ZZ Divan Oslo'])).toBe('Devorlar oq. Burchakda ZZ Divan Oslo turadi.')
  })

  it('the sentence goes when none of its pieces is left', () => {
    const text = 'Devorlar oq. Xonada ZZ Divan Oslo va ZZ Kreslo Nord turadi.'
    expect(summaryWithout(text, [{ name: 'ZZ Divan Oslo', role: 'sofa' }, { name: 'ZZ Kreslo Nord', role: 'armchair' }])).toBe('Devorlar oq.')
  })

  it('a sentence naming one piece among other words still goes whole', () => {
    const text = 'Devorlar oq. Burchakda ZZ Kreslo Nord, yumshoq va qulay, turadi.'
    expect(summaryWithout(text, [{ name: 'ZZ Kreslo Nord', role: 'armchair' }], ['ZZ Divan Oslo'])).toBe('Devorlar oq.')
  })
})

describe('summaryWithout: a piece said to be left out or replaced is not named', () => {
  const GILAM = { name: 'ZZ Gilam jun och', role: 'rug' }

  it('"gilam o\'rniga plitka" stays when the rug was dropped (minimalist)', () => {
    for (const rug of [GILAM, { name: 'Gilam', role: 'rug' }]) expect(summaryWithout(MINIMALIST, [rug], ['ZZ Divan Line'])).toBe(MINIMALIST)
  })

  it('nor does a negation: "... yo\'q", "... emas", "...siz"', () => {
    for (const text of ["Devorlar oq. Polda gilam yo'q.", 'Devorlar oq. Bu gilam emas, plitka.', 'Devorlar oq. Pol gilamsiz, toza plitka.',
      "Devorlar oq. ZZ Gilam jun och o'rniga plitka tanlandi."]) {
      expect(summaryWithout(text, [GILAM])).toBe(text)
    }
  })

  it('a rug said to be in the room is named by "gilam" and goes', () => {
    expect(summaryWithout('Devorlar oq. Polda och gilam yotadi.', [GILAM])).toBe('Devorlar oq.')
  })
})

describe('summaryWithout: "kind (Name)" is one item', () => {
  const kept = ['ZZ Kreslo Soft', 'ZZ Gilam jun och', 'ZZ TV tumba Grafit', "ZZ Jurnal stoli metall-yog'och"]
  const SOFA = { name: 'ZZ Divan Nova', role: 'sofa' }

  it('a dropped first item goes with its kind, the words before it stay', () => {
    expect(summaryWithout('Mebel sifatida zamonaviy uslubdagi divan (ZZ Divan Nova), kreslo (ZZ Kreslo Soft) va gilam (ZZ Gilam jun och) tanlandi.', [SOFA], kept))
      .toBe('Mebel sifatida zamonaviy uslubdagi kreslo (ZZ Kreslo Soft) va gilam (ZZ Gilam jun och) tanlandi.')
    expect(summaryWithout(ILIQ_FURNITURE, [SOFA], kept)).toBe(
      'Mebel sifatida zamonaviy uslubdagi televizor tumba (ZZ TV tumba Grafit), kreslo (ZZ Kreslo Soft), '
      + "metall-yog'och jurnal stoli (ZZ Jurnal stoli metall-yog'och) va och jigarrang gilam (ZZ Gilam jun och) tanlandi.",
    )
  })

  it('at the start of the sentence, the next item takes its capital', () => {
    expect(summaryWithout('Divan (ZZ Divan Nova) va kreslo (ZZ Kreslo Soft) tanlandi.', [SOFA], kept)).toBe('Kreslo (ZZ Kreslo Soft) tanlandi.')
  })
})

describe('summaryWithout: only a list of bare pieces is edited item by item', () => {
  const kept = ['ZZ Divan Oslo', 'ZZ Kreslo Nord', 'ZZ Pufik']
  const without = (name: string) => kept.filter((k) => k !== name)
  const cases: Array<[string, { name: string; role?: string }]> = [
    ['ZZ Divan Oslo va ZZ Kreslo Nord gilam ustida turadi.', { name: 'ZZ Gilam jun och', role: 'rug' }],
    ['Gilam ostida ZZ Divan Oslo va ZZ Kreslo Nord turadi.', { name: 'ZZ Gilam jun och', role: 'rug' }],
    ["ZZ Divan Oslo A devori bo'ylab, ZZ Kreslo Nord esa deraza yonida joylashgan.", { name: 'ZZ Kreslo Nord', role: 'armchair' }],
    ["ZZ Divan Oslo deraza yonida turadi va ZZ Kreslo Nord unga qarama-qarshi qo'yilgan.", { name: 'ZZ Divan Oslo', role: 'sofa' }],
    ['ZZ Divan Oslo va ZZ Kreslo Nord (ZZ Pufik bilan) turadi.', { name: 'ZZ Pufik' }],
  ]
  it.each(cases)('"%s": an item with words of its own, so the sentence goes whole', (sentence, dropped) => {
    expect(summaryWithout(`Devorlar oq. ${sentence}`, [dropped], without(dropped.name))).toBe('Devorlar oq.')
  })

  it('every item of a "Mebel:" list is a piece, with nothing said to be kept', () => {
    expect(summaryWithout('Devorlar oq. Mebel: ZZ Divan Oslo, ZZ Kreslo Nord va ZZ Pufik.', [{ name: 'ZZ Pufik' }]))
      .toBe('Devorlar oq. Mebel: ZZ Divan Oslo va ZZ Kreslo Nord.')
    expect(summaryWithout('Devorlar oq. Mebel: ZZ Divan Oslo, ZZ Kreslo Nord va ZZ Pufik.', [{ name: 'ZZ Kreslo Nord', role: 'armchair' }]))
      .toBe('Devorlar oq. Mebel: ZZ Divan Oslo va ZZ Pufik.')
  })

  it("a last piece said to be missing is no bare item: the sentence, not naming it, stays", () => {
    const text = "Devorlar oq. ZZ Divan Oslo va ZZ Kreslo Nord yo'q joyda turadi."
    expect(summaryWithout(text, [{ name: 'ZZ Kreslo Nord', role: 'armchair' }], ['ZZ Divan Oslo'])).toBe(text)
  })

  it('a lone kind word is a bare item too', () => {
    expect(summaryWithout('Devorlar oq. Xonada divan, ZZ Kreslo Nord va ZZ Pufik turadi.', [{ name: 'ZZ Pufik' }], ['ZZ Kreslo Nord']))
      .toBe('Devorlar oq. Xonada divan va ZZ Kreslo Nord turadi.')
  })
})

describe('summaryWithout: a floor lamp left out', () => {
  it('is named by "torsher" (and "торшер", "floor lamp"), and its sentence goes', () => {
    const LAMP = { name: 'Torsher', role: 'floor_lamp' }
    expect(summaryWithout("Devorlar oq. Burchakda torsher turadi.", [LAMP])).toBe('Devorlar oq.')
    expect(summaryWithout('Стены белые. В углу стоит торшер.', [LAMP])).toBe('Стены белые.')
    expect(summaryWithout('Walls are white. A floor lamp stands in the corner.', [{ name: 'Floor lamp', role: 'floor_lamp' }])).toBe('Walls are white.')
    expect(summaryWithout('Walls are white. A tall lamp stands in the corner.', [{ name: 'Floor lamp X', role: 'floor_lamp' }]))
      .toBe('Walls are white. A tall lamp stands in the corner.')
  })
})
