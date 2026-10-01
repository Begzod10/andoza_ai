import { describe, it, expect } from 'vitest'
import { contactLinks, phoneHref, telegramHandle } from '../storeContact'

describe('phoneHref', () => {
  it('keeps digits only and adds the +', () => {
    expect(phoneHref('+998 90 123 45 67')?.href).toBe('tel:+998901234567')
    expect(phoneHref('(90) 123-45-67')?.href).toBe('tel:+998901234567') // bare Uzbek mobile
  })
  it('keeps what the shop typed as the label', () => {
    expect(phoneHref('+998 90 123 45 67')?.label).toBe('+998 90 123 45 67')
  })
  it('rejects empty, too short and absurdly long numbers', () => {
    for (const bad of [null, undefined, '', '12345', '9'.repeat(16), 'call me']) expect(phoneHref(bad)).toBeNull()
  })
})

describe('telegramHandle', () => {
  it('reads every spelling of the same handle', () => {
    for (const raw of ['@mebelplus', 'mebelplus', 't.me/mebelplus', 'https://t.me/mebelplus', 'https://t.me/mebelplus/', ' @mebelplus '])
      expect(telegramHandle(raw)).toBe('mebelplus')
  })
  it('refuses anything that could be an injected link', () => {
    for (const bad of ['javascript:alert(1)', 'https://evil.example/mebelplus', '@a b', '@abc', '<script>', 'https://t.me/x?y=1', null, ''])
      expect(telegramHandle(bad)).toBeNull()
  })
})

describe('contactLinks', () => {
  it('builds both links from a shop', () => {
    expect(contactLinks({ phone: '+998901234567', telegram: '@mebelplus' })).toEqual([
      { kind: 'tel', href: 'tel:+998901234567', label: '+998901234567' },
      { kind: 'telegram', href: 'https://t.me/mebelplus', label: '@mebelplus' },
    ])
  })
  it('offers only what is usable, and nothing for no shop', () => {
    expect(contactLinks({ phone: null, telegram: '@mebelplus' }).map((l) => l.kind)).toEqual(['telegram'])
    expect(contactLinks({ phone: 'abc', telegram: 'javascript:1' })).toEqual([])
    expect(contactLinks(null)).toEqual([])
  })
})
