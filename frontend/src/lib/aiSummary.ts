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
  bed: 'karavot|krovat', wardrobe: 'shkaf|garderob', desk: 'stol', sofa: 'divan', armchair: 'kreslo', tv_unit: 'tumba', rug: 'gilam',
  // A floor lamp the layout left out (a light, not furniture): its word in the three languages a summary is in.
  floor_lamp: 'torsher|торшер\\p{L}*|floor\\s+lamps?',
}

// The start of a word: "tumba" names "tumbasi", not "tumbochka"; an Uzbek apostrophe is inside a word.
export const WORD_START = "(?<![\\p{L}\\p{N}'ʻʼ‘’`])"
// The end of one, after the endings a name or role word takes in a sentence ("shkafi", "tumbasi",
// "gilamlar", "divanga"): "Gilam" names "Gilamlar", not "Gilamcha".
const WORD_END = "(?:lar)?(?:i|si)?(?:ga|da|dan|ni|ning|dir)?(?![\\p{L}\\p{N}'ʻʼ‘’`])"
/**
 * After a name or role word: the piece is said to be replaced, not there or only like it ("gilam
 * o'rniga plitka", "gilam yo'q", "divan emas", "gilamga o'xshash"), so the word does not name it. "Gilamsiz" is no match to begin with: "siz"
 * is not among WORD_END's endings.
 */
const NOT_THERE = "(?!\\s+(?:o['ʻʼ‘’`]rniga|yo['ʻʼ‘’`]q|emas|o['ʻʼ‘’`]xshash\\p{L}*)(?![\\p{L}\\p{N}'ʻʼ‘’`]))"
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A sentence ends at . ! ? or … followed by a space: "3.5 m" and "yog'och" do not end one. */
export const SENTENCE_END = /(?<=[.!?…])\s+/u

/** A furniture list: "Mebel: A, B va C." as the backend's `describe_plan` writes it, its body and its end. */
const LIST = /^(\s*mebel\s*:\s*)?(.*?)([.!?…]*)$/isu
/**
 * The words before a dropped first item's piece that stay: all of them, but when the piece is named in
 * brackets after its kind ("... uslubdagi divan (ZZ Divan Nova)"), the kind goes with it: the last word,
 * and the one before it when the last ends in a compound's "-i" ("jurnal stoli").
 */
function leadIn(before: string): string {
  if (!/\(\s*$/u.test(before)) return before
  const words = before.replace(/\s*\(\s*$/u, '').trim().split(/\s+/u)
  const kind = words.length > 1 && /i$/u.test(words[words.length - 1]) ? 2 : 1
  const rest = words.slice(0, -kind).join(' ')
  return rest ? `${rest} ` : ''
}
/** What joins a list's items, kept in the split: ", ", " va ", " hamda " ("3,5 m" is no list). */
const ITEM_SEP = /(,(?!\d)\s*|\s+(?:va|hamda)\s+)/iu
const isAnd = (sep: string) => sep.trim() !== ','
/** Every role's word: a lone one is a bare list item ("Xonada divan, ZZ Kreslo Nord va ..."). */
const KIND_WORDS = Object.values(ROLE_WORD).join('|')

/**
 * `summary` with every sentence removed that names one of `dropped`: by its full catalog name, or by
 * its role's word outside a `kept` piece's name, and not as replaced or missing (`NOT_THERE`). A list of
 * two or more of the plan's pieces (`dropped` and `kept`) whose items are bare pieces (see `without`), or
 * a "Mebel: A, B, C." list, loses only the dropped items and goes only when no piece is left in it. When
 * every sentence would go, the summary stays whole: something is better than nothing.
 */
export function summaryWithout(summary: string, dropped: { name: string; role?: string }[], kept: string[] = []): string {
  if (dropped.length === 0) return summary
  const names = dropped.map((d) => d.name.trim().toLowerCase()).filter(Boolean)
  const words = dropped.map((d) => (d.role ? ROLE_WORD[d.role] : undefined)).filter(Boolean)
  const nameWord = names.length ? new RegExp(`${WORD_START}(?:${names.map(escape).join('|')})${WORD_END}${NOT_THERE}`, 'iu') : null
  const roleWord = words.length ? new RegExp(`${WORD_START}(?:${words.join('|')})${WORD_END}${NOT_THERE}`, 'iu') : null
  const keptNames = kept.map((n) => n.trim()).filter(Boolean)
  // A role word inside a kept piece's own name ("Tuvalet stoli", "Kitob shkafi") is that piece's, not the dropped one's.
  const keptName = keptNames.length ? new RegExp(`${WORD_START}(?:${keptNames.map(escape).join('|')})${WORD_END}`, 'giu') : null
  // A dropped piece's own name said as replaced ("ZZ Gilam jun och o'rniga") holds its role word too.
  const anyName = names.length ? new RegExp(`${WORD_START}(?:${names.map(escape).join('|')})${WORD_END}`, 'giu') : null
  const namesKept = (text: string) => keptName !== null && text.search(keptName) !== -1
  /** Where `text` names a dropped piece, as [start, end], or null. */
  const droppedAt = (text: string): [number, number] | null => {
    const byName = nameWord?.exec(text)
    if (byName) return [byName.index, byName.index + byName[0].length]
    const blank = (t: string, re: RegExp | null) => (re ? t.replace(re, (m) => ' '.repeat(m.length)) : t)
    const bare = blank(blank(text, keptName), anyName)
    const byRole = roleWord?.exec(bare)
    return byRole ? [byRole.index, byRole.index + byRole[0].length] : null
  }
  const hit = (text: string) => droppedAt(text) !== null
  // A bare mention of a piece: its name, "kind (Name)", or a lone kind word.
  const planNames = [...names, ...keptNames].map(escape).join('|')
  const name = planNames ? `${WORD_START}(?:${planNames})${WORD_END}` : '(?!)'
  const kindWord = `${WORD_START}(?:${KIND_WORDS})${WORD_END}`
  const inBrackets = planNames ? `\\(\\s*(?:${planNames})\\s*\\)` : '(?!)'
  const FIRST = new RegExp(`^(.*?)(${name}|${kindWord}|${inBrackets})\\s*$`, 'isu')
  const MIDDLE = new RegExp(`^\\s*(?:${name}|${kindWord}|[^()]*?${inBrackets})\\s*$`, 'isu')
  // A last piece said to be missing ("ZZ Kreslo Nord yo'q joyda") is no bare item.
  const LAST = new RegExp(`^(\\s*(?:[^()]*?${inBrackets}|${name}|${kindWord}))${NOT_THERE}((?:\\s.*)?)$`, 'isu')
  type Item = { lead: string; mention: string; tail: string }
  /** An item as lead-in, bare mention and tail (a lead-in only on the first, a tail only on the last); null when it is not bare. */
  const parse = (item: string, i: number, n: number, mebel: boolean): Item | null => {
    if (mebel) return { lead: '', mention: item, tail: '' }
    if (i === 0) { const m = item.match(FIRST); return m ? { lead: m[1], mention: item.slice(m[1].length), tail: '' } : null }
    if (i === n - 1) { const m = item.match(LAST); return m ? { lead: '', mention: m[1], tail: m[2] } : null }
    return MIDDLE.test(item) ? { lead: '', mention: item, tail: '' } : null
  }
  /** A dropped first item's lead-in as it stays: its kind goes with a name in brackets. */
  const leadOf = (it: Item) => (/^\s*\(/u.test(it.mention) ? leadIn(`${it.lead}(`) : it.lead)
  const whole = (sentence: string) => (hit(sentence) ? null : sentence)

  /**
   * The sentence without its dropped items when it is a list of bare pieces, else whole, or null when it
   * names a dropped piece. A list's items are each a piece's name, "kind (Name)" or a lone kind word, with
   * at most words before the first and after the last; a "Mebel:" list's items are all pieces. An item
   * with words of its own ("ZZ Kreslo Nord esa deraza yonida") makes the sentence one to keep or drop whole.
   */
  const without = (sentence: string): string | null => {
    const [, prefix = '', body, end] = sentence.match(LIST)!
    const mebel = prefix !== ''
    const parts = body.split(ITEM_SEP)
    const raw = parts.filter((_, i) => i % 2 === 0)
    const seps = parts.filter((_, i) => i % 2 === 1)
    if (raw.length < 2 && !mebel) return whole(sentence)
    const items = raw.map((item, i) => parse(item, i, raw.length, mebel))
    if (items.some((it) => it === null)) return whole(sentence)
    const parsed = items as Item[]
    const gone = parsed.map((it) => hit(it.mention))
    const piece = parsed.map((it, i) => mebel || gone[i] || namesKept(it.mention))
    if (!mebel && piece.filter(Boolean).length < 2) return whole(sentence)
    const n = parsed.length
    // Words before the first piece or after the last that name a dropped one: the whole sentence goes.
    if (hit(leadOf(parsed[0])) || hit(parsed[n - 1].tail)) return null
    if (!gone.some(Boolean)) return sentence
    if (piece.every((p, i) => !p || gone[i])) return null
    // Each item as it stays, with the joiner before it: a dropped one goes, but the first keeps the words
    // before its piece and the last the words after it ("... ZZ Stul mebellari tanlandi"), which belong to
    // the whole sentence. A dropped item in the middle takes the joiner before it, so "A, B va C" without
    // B is "A va C".
    type Kept = { text: string; sep: string; listed: boolean; glued?: 'next' | 'prev' }
    const out: Kept[] = []
    parsed.forEach((it, i) => {
      const sep = i > 0 ? seps[i - 1] : ''
      if (!gone[i]) out.push({ text: it.lead + it.mention + it.tail, sep, listed: true })
      else if (i === 0) out.push({ text: leadOf(it), sep, listed: false, glued: 'next' })
      else if (i === n - 1) out.push({ text: it.tail, sep: '', listed: false, glued: 'prev' })
    })
    // A list said "A, B va C" keeps its "va" before the last piece left when the "va" went with C.
    const and = seps.find(isAnd)
    const listed = out.filter((o) => o.listed)
    if (and && listed.length > 1 && !listed.slice(1).some((o) => isAnd(o.sep))) listed[listed.length - 1].sep = and
    let text = ''
    out.forEach((o, k) => {
      const glue = k === 0 || o.glued === 'prev' || out[k - 1].glued === 'next'
      text += (glue ? '' : o.sep) + o.text
    })
    text = text.trim()
    // The sentence lost its first word: the next one takes its capital.
    if (!mebel && /^\p{Lu}/u.test(body) && !/^\p{Lu}/u.test(text)) text = text.charAt(0).toLocaleUpperCase() + text.slice(1)
    return `${prefix}${text}${end}`
  }
  const sentences = summary.trim().split(SENTENCE_END)
  const out = sentences.map(without)
  const remaining = out.filter((s): s is string => s !== null)
  if (remaining.length === 0 || out.every((s, i) => s === sentences[i])) return summary
  return remaining.join(' ')
}
