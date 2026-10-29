import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FacadeOrder } from './FacadeOrder'
import i18n from '@/i18n'

describe('FacadeOrder', () => {
  it('lists each cabinet with its doors and the total area', () => {
    render(<FacadeOrder
      lines={[{ id: 'M1-F1', cabinetId: 'c1', length: 718, width: 598, qty: 1, materialId: 'm1' },
        { id: 'M2-F1', cabinetId: 'c2', length: 718, width: 398, qty: 2, materialId: 'm1' }]}
      labelOf={(id) => (id === 'c1' ? 'M1' : 'M2')} materialName={() => 'MDF Oq'} />)
    const table = screen.getByRole('table', { name: i18n.t('mebel.facade_order') })
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 2 + 1)
    expect(table).toHaveTextContent('718')
    expect(table).toHaveTextContent('398')
    expect(screen.getByText(i18n.t('mebel.facade_total', { m2: '1.001' }), { exact: false })).toBeInTheDocument()
  })
})
