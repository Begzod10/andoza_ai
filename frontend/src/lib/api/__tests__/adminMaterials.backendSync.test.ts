// The admin material form's lists mirror the backend's. These read the backend
// source (the repository is checked out whole in CI and locally), so a value added
// on one side and forgotten on the other fails here instead of as a 422 in the panel.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MATERIAL_CATEGORIES, MATERIAL_UNITS, PACK_UNITS, SMETA_KEYS } from '../adminMaterials'

const backend = (path: string) => readFileSync(resolve(__dirname, '../../../../../backend', path), 'utf8')
const quoted = (text: string) => [...text.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1])
const block = (text: string, start: RegExp, end: string) => {
  const from = text.search(start)
  if (from < 0) throw new Error(`backend block not found: ${start}`)
  // Comments could hold quoted words that are not values.
  return text.slice(from, text.indexOf(end, from)).replace(/#.*$/gm, '')
}

describe('admin material lists match the backend', () => {
  const model = backend('app/models/material.py')

  it('categories', () => {
    const enums = quoted(block(model, /MaterialCategory = Enum\(/, 'name=')).filter((v) => v !== 'material_category')
    expect(MATERIAL_CATEGORIES.map((c) => c.id).sort()).toEqual(enums.sort())
  })

  it('units', () => {
    const enums = quoted(block(model, /MaterialUnit = Enum\(/, 'name=')).filter((v) => v !== 'material_unit')
    expect(MATERIAL_UNITS.map((u) => u.id).sort()).toEqual(enums.sort())
  })

  it('pack units', () => {
    const schema = backend('app/schemas/admin_materials.py')
    const line = schema.split('\n').find((l) => l.startsWith('PACK_UNITS'))!
    expect(PACK_UNITS.map((u) => u.id).sort()).toEqual(quoted(line).sort())
  })

  it('estimate keys and the pack unit each needs', () => {
    const keys = backend('app/services/smeta_keys.py')
    const dict = block(keys, /KEY_PACK_UNIT: dict\[str, str \| None\] = \{/, '}')
    const backendPairs = Object.fromEntries(
      [...dict.matchAll(/"([a-z_]+)":\s*(None|"([a-z0-9]+)")/g)].map((m) => [m[1], m[3] ?? null]),
    )
    const frontPairs = Object.fromEntries(
      SMETA_KEYS.filter((k) => !k.id.startsWith('light:')).map((k) => [k.id, k.packUnit]),
    )
    expect(frontPairs).toEqual(backendPairs)
  })
})
