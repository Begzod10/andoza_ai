/**
 * The AI designer's summary, told after the layout: a piece it could not place should not be
 * described as standing in the room. Kept conservative, so a sentence goes only when it plainly
 * names a left-out piece.
 */

/**
 * The word a summary uses for a piece of this role, when it does not give the catalog name
 * ("kiyim shkafi" for "ZZ Kiyim shkafi Nord"). Only roles whose word names nothing else: "stol" is a
 * desk only when the desk is what was left out, a nightstand or a chair has no word of its own.
 */
const ROLE_WORD: Partial<Record<string, string>> = {
  bed: 'karavot', wardrobe: 'shkaf|garderob', desk: 'stol', sofa: 'divan', armchair: 'kreslo', tv_unit: 'tumba',
}

// The start of a word: "tumba" names "tumbasi", not "tumbochka"; an Uzbek apostrophe is inside a word.
const WORD_START = "(?<![\\p{L}\\p{N}'ʻʼ‘’`])"

/** A sentence ends at . ! ? or … followed by a space: "3.5 m" and "yog'och" do not end one. */
const SENTENCE_END = /(?<=[.!?…])\s+/u

/**
 * `summary` with every sentence removed that names one of `dropped`: by its full catalog name, or by
 * its role's word. When every sentence would go, the summary stays whole: something is better than nothing.
 */
export function summaryWithout(summary: string, dropped: { name: string; role?: string }[]): string {
  if (dropped.length === 0) return summary
  const names = dropped.map((d) => d.name.trim().toLowerCase()).filter(Boolean)
  const words = dropped.map((d) => (d.role ? ROLE_WORD[d.role] : undefined)).filter(Boolean)
  const roleWord = words.length ? new RegExp(`${WORD_START}(?:${words.join('|')})`, 'iu') : null
  const namesDropped = (sentence: string) => {
    const low = sentence.toLowerCase()
    return names.some((n) => low.includes(n)) || (roleWord?.test(sentence) ?? false)
  }
  const sentences = summary.trim().split(SENTENCE_END)
  const kept = sentences.filter((s) => !namesDropped(s))
  if (kept.length === sentences.length || kept.length === 0) return summary
  return kept.join(' ')
}
