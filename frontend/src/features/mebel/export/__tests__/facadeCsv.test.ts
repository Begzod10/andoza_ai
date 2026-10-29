import { describe, it, expect } from 'vitest'
import { facadeOrderCsv } from '../facadeCsv'

const lines = [
  { id: 'M1-F1', cabinetId: 'c1', length: 718, width: 598, qty: 1, materialId: 'm1' },
  { id: 'M2-F1', cabinetId: 'c2', length: 718, width: 398, qty: 2, materialId: null },
]
const labels = { cabinet: (id: string) => (id === 'c1' ? 'M1' : 'M2'), material: (id: string | null) => (id ? 'MDF Oq' : '=cmd') }

describe('facadeOrderCsv', () => {
  const csv = facadeOrderCsv(lines, labels)
  const rows = csv.slice(1).split('\r\n')
  it('has a BOM and the fixed header', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(rows[0]).toBe('Shkaf;Uzunlik;Eni;Soni;Material;m²')
  })
  it('one line per cabinet, area with a decimal comma', () => {
    expect(rows[1]).toBe('M1;718;598;1;MDF Oq;0,429')
    expect(rows[2]).toBe("M2;718;398;2;'=cmd;0,572")
  })
})
