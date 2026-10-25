import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOM_TYPES, GUESS_RULES, guessRoomType, effectiveRoomType } from '../roomType'
import uz from '@/i18n/locales/uz.json'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'

const CASES: Array<[string, string | null]> = [
  ['Bolalar yotoqxonasi', 'bolalar'], ['Детская', 'bolalar'], ['Yotoqxona', 'yotoqxona'], ['Спальня', 'yotoqxona'],
  ['Oshxona', 'oshxona'], ['КУХНЯ', 'oshxona'], ['Kabinet', 'kabinet'], ['Ish xona', 'kabinet'], ['Кабинет', 'kabinet'],
  ['Hammom', 'hammom'], ['Vanna xonasi', 'hammom'], ['Ванная', 'hammom'], ['Санузел', 'hammom'],
  ['Balkon', 'balkon'], ['Балкон', 'balkon'], ['Mehmonxona', 'mehmonxona'], ['Zal', 'mehmonxona'], ['Гостиная', 'mehmonxona'],
  ['Xona 2', null], ['', null],
]

describe('guessRoomType', () => {
  it.each(CASES)('%s -> %s', (name, expected) => {
    expect(guessRoomType(name)).toBe(expected)
  })

  it('lists the seven types in the backend order', () => {
    expect(ROOM_TYPES).toEqual(['mehmonxona', 'yotoqxona', 'bolalar', 'oshxona', 'kabinet', 'hammom', 'balkon'])
  })

  it('has the same rules as the backend GUESS_RULES', () => {
    const py = readFileSync(resolve(__dirname, '../../../../backend/app/services/room_type.py'), 'utf8')
    const block = py.slice(py.indexOf('GUESS_RULES'))
    const rules = [...block.matchAll(/\("(\w+)", \(([^)]*)\)\)/g)].map((m) => [
      m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((n) => n[1]),
    ])
    expect(rules).toEqual(GUESS_RULES.map(([t, n]) => [t, [...n]]))
  })
})

describe('effectiveRoomType', () => {
  it('uses the room\'s own type', () => expect(effectiveRoomType('yotoqxona', 'Oshxona')).toBe('yotoqxona'))
  it('falls back to the guess from the name when the type is NULL', () => expect(effectiveRoomType(null, 'Oshxona')).toBe('oshxona'))
  it('is undefined when nothing is known', () => expect(effectiveRoomType(null, 'Xona 2')).toBeUndefined())
})

describe('locales', () => {
  it.each([['uz', uz], ['ru', ru], ['en', en]])('%s has the room type labels', (_l, loc) => {
    const rooms = (loc as unknown as { rooms: Record<string, string | Record<string, string>> & { type: Record<string, string> } }).rooms
    for (const k of ['type_label', 'type_none', 'type_guess', 'type_save_failed']) expect(rooms[k]).toBeTruthy()
    for (const id of ROOM_TYPES) expect(rooms.type[id]).toBeTruthy()
  })
})
