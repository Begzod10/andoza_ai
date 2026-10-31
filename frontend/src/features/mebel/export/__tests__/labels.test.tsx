import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { partLabels } from '../labels'
import { LabelsPrintView } from '../LabelsPrintView'
import { computeProject, EMPTY_PRICE_BOOK, newProject } from '@/features/mebel/engine'

function project(facade: 'ldsp' | 'mdf' = 'ldsp') {
  const p = newProject('Oshxona')
  p.defaults.facade = { ...p.defaults.facade, kind: facade }
  p.cabinets = [{ ...p.cabinets[0], id: 'c1', label: 'M1' }, { ...p.cabinets[0], id: 'c2', label: 'M2', drawers: 3, position: { x: 600, z: 0 } }]
  return computeProject(p, EMPTY_PRICE_BOOK, {})
}
const labelOf = (id: string) => (id === 'c1' ? 'M1' : 'M2')
const opts = { projectId: 'p1', origin: 'https://andozaai.uz', labelOf, materialName: () => 'LDSP' }

describe('partLabels', () => {
  it('one label per part the workshop cuts, in id order', () => {
    const r = project()
    const labels = partLabels(r.parts, opts)
    expect(labels).toHaveLength(r.parts.length)
    expect(labels.map(l => l.partId)).toEqual([...r.parts.map(p => p.id)].sort())
  })

  it('MDF doors are ordered, not cut: no label for them', () => {
    const labels = partLabels(project('mdf').parts, opts)
    expect(labels.some(l => l.role === 'door' || l.role === 'drawer_front')).toBe(false)
  })

  it('carries the finished size, the bands on each side and a link to the part', () => {
    const r = project()
    const side = r.parts.find(p => p.role === 'side_left' && p.cabinetId === 'c1')!
    const l = partLabels(r.parts, opts).find(x => x.partId === side.id)!
    expect(l).toMatchObject({ cabinet: 'M1', length: side.finished.length, width: side.finished.width, thickness: 18, grain: 'length' })
    expect(l.edges).toEqual({ L1: 2, L2: null, W1: 0.4, W2: null })
    expect(l.url).toBe(`https://andozaai.uz/mebel/p1?part=${side.id}`)
  })
})

describe('LabelsPrintView', () => {
  const labels = () => partLabels(project().parts, opts)

  it('A4: 70×37 mm labels on an A4 page, each with a QR code', () => {
    const { container } = render(<LabelsPrintView projectName="Oshxona" labels={labels()} format="a4" />)
    const all = screen.getAllByTestId('label')
    expect(all).toHaveLength(labels().length)
    expect(container.querySelector('style')!.textContent).toContain('size: A4 portrait')
    expect(all[0].getAttribute('style')).toContain('width: 70mm')
    expect(within(all[0]).getByTestId('qr').querySelectorAll('rect').length).toBeGreaterThan(20)
    expect(within(all[0]).getByText(labels()[0].partId)).toBeInTheDocument()
  })

  it('roll: a 58×40 mm page per label', () => {
    const { container } = render(<LabelsPrintView projectName="Oshxona" labels={labels()} format="roll" />)
    expect(container.querySelector('style')!.textContent).toContain('size: 58mm 40mm')
    expect(screen.getAllByTestId('label')[0].getAttribute('style')).toContain('break-after: page')
  })
})
