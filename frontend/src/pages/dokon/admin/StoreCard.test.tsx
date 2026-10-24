import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StoreCard } from './StoreCard'
import type { AdminStore } from '@/lib/api'

const store = (patch: Partial<AdminStore> = {}): AdminStore => ({
  id: 's1', name: 'Dafna', district: null, phone: null, telegram: null, logo_color: null,
  partner_tier: 'standard', is_active: true, created_at: '2026-10-24T00:00:00Z', ...patch,
})

describe('StoreCard', () => {
  it('marks a demo (presentation) store with a "Namuna" badge', () => {
    render(<StoreCard store={store({ is_demo: true })} modelCount={3} onClick={() => {}} />)
    expect(screen.getByText('Namuna')).toBeInTheDocument()
  })

  it('shows no badge for a real store', () => {
    render(<StoreCard store={store({ is_demo: false })} modelCount={3} onClick={() => {}} />)
    expect(screen.queryByText('Namuna')).toBeNull()
  })
})
