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
// The end of one, after the endings a name or role word takes in a sentence ("shkafi", "tumbasi",
// "gilamlar", "divanga"): "Gilam" names "Gilamlar", not "Gilamcha".
const WORD_END = "(?:lar)?(?:i|si)?(?:ga|da|dan|ni|ning|dir)?(?![\\p{L}\\p{N}'ʻʼ‘’`])"
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A sentence ends at . ! ? or … followed by a space: "3.5 m" and "yog'och" do not end one. */
const SENTENCE_END = /(?<=[.!?…])\s+/u

/** A furniture list: "Mebel: A, B va C." as the backend's `describe_plan` writes it, its items and its end. */
const LIST = /^(\s*mebel\s*:\s*)?(.*?)([.!?…]*)$/isu
const ITEM_SEP = /,\s*|\s+va\s+/iu

/**
 * `summary` with every sentence removed that names one of `dropped`: by its full catalog name, or by
 * its role's word. A list of pieces ("Mebel: A, B, C.", or any sentence whose items are all the plan's
 * pieces, `dropped` and `kept`) loses only the dropped items, and goes only when none is left. When every
 * sentence would go, the summary stays whole: something is better than nothing.
 */
export function summaryWithout(summary: string, dropped: { name: string; role?: string }[], kept: string[] = []): string {
  if (dropped.length === 0) return summary
  const names = dropped.map((d) => d.name.trim().toLowerCase()).filter(Boolean)
  const words = dropped.map((d) => (d.role ? ROLE_WORD[d.role] : undefined)).filter(Boolean)
  const nameWord = names.length ? new RegExp(`${WORD_START}(?:${names.map(escape).join('|')})${WORD_END}`, 'iu') : null
  const roleWord = words.length ? new RegExp(`${WORD_START}(?:${words.join('|')})${WORD_END}`, 'iu') : null
  const pieces = new Set([...names, ...kept.map((n) => n.trim().toLowerCase()).filter(Boolean)])
  const namesDropped = (sentence: string) => (nameWord?.test(sentence) ?? false) || (roleWord?.test(sentence) ?? false)
  /** The sentence without its dropped items when it is a list, else whole or null when it names a dropped piece. */
  const without = (sentence: string): string | null => {
    const [, prefix = '', body, end] = sentence.match(LIST)!
    const items = body.split(ITEM_SEP)
    const isList = prefix !== '' || (items.length > 1 && items.every((i) => pieces.has(i.trim().toLowerCase())))
    if (!isList) return namesDropped(sentence) ? null : sentence
    const left = items.filter((i) => !namesDropped(i))
    if (left.length === items.length) return sentence
    if (left.length === 0) return null
    // "A, B va C" keeps its "va" before the last item left.
    const va = /\s+va\s+\S[^,]*$/iu.test(body)
    const joined = va && left.length > 1 ? `${left.slice(0, -1).join(', ')} va ${left[left.length - 1]}` : left.join(', ')
    return `${prefix}${joined}${end}`
  }
  const sentences = summary.trim().split(SENTENCE_END)
  const out = sentences.map(without)
  const remaining = out.filter((s): s is string => s !== null)
  if (remaining.length === 0 || out.every((s, i) => s === sentences[i])) return summary
  return remaining.join(' ')
}
