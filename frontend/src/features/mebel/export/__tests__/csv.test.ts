import { describe, it, expect } from 'vitest'
import { cutListCsv } from '../csv'
import { baseCabinetParts, DEFAULTS, groupParts } from '@/features/mebel/engine'
import type { CutGroup } from '@/features/mebel/engine'

const cab = { id: 'c1', type: 'base' as const, label: 'M1', width: 600, height: 720, depth: 560, shelves: 1, position: { x: 0, z: 0 } }
const groups = groupParts(baseCabinetParts(cab, DEFAULTS))
const labels = {
  part: (g: CutGroup) => ({ side_left: 'Chap yon', bottom: 'Taglik' } as Record<string, string>)[g.role] ?? g.role,
  material: (g: CutGroup) => (g.material === 'board' ? 'LDSP' : 'HDF'),
  grain: (gr: CutGroup['grain']) => (gr === 'none' ? '' : 'uzunlik'),
}

describe('cutListCsv', () => {
  const csv = cutListCsv(groups, labels)
  const lines = csv.slice(1).split('\r\n')

  it('starts with a BOM so Excel reads UTF-8, and has the fixed header', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(lines[0]).toBe('ID;Detal;Material;Qalinlik;Uzunlik;Eni;Soni;Tekstura;Kromka L1;Kromka L2;Kromka W1;Kromka W2')
  })

  it('one line per group, decimal comma, band thickness per side', () => {
    expect(lines).toHaveLength(groups.length + 1)
    expect(lines[1]).toBe('M1-01, M1-02;Chap yon;LDSP;18;719,6;554;2;uzunlik;2;;0,4;')
    expect(lines.find(l => l.includes('Taglik'))).toBe('M1-03;Taglik;LDSP;18;564;554;1;uzunlik;2;;;')
  })

  it('quotes a field holding ; or a quote', () => {
    const odd = cutListCsv(groups.slice(0, 1), { ...labels, material: () => 'Dub "Sonoma"; oq' })
    expect(odd.slice(1).split('\r\n')[1]).toContain(';"Dub ""Sonoma""; oq";')
  })
})
