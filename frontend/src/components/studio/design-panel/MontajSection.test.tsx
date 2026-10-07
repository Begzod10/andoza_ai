import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRoomStore } from '@/store/roomStore'
import { MontajSection } from './MontajSection'

const point = (id: string, type: 'socket1' | 'switch1' | 'ac', wallId = 'A', heightMm = 300) => ({ id, type, wallId, positionMm: 500, heightMm })

beforeEach(() => useRoomStore.setState({ electricals: [] }))

describe('MontajSection', () => {
  it('says how to add the first point when there are none, instead of an empty shell', () => {
    render(<MontajSection />)
    expect(screen.getByText("Elektr nuqtalari yo'q")).toBeInTheDocument()
    expect(screen.getByText(/devorni bosing/i)).toBeInTheDocument()
    expect(screen.queryByText(/sozlamalar yo'q/)).toBeNull()
  })

  it('lists the placed points by kind with how many of each and where they are', () => {
    useRoomStore.setState({ electricals: [point('1', 'socket1', 'A', 300), point('2', 'socket1', 'B', 1100), point('3', 'switch1', 'D', 900)] })
    render(<MontajSection />)
    expect(screen.getByText('Elektr nuqtalari (3)')).toBeInTheDocument()
    expect(screen.getByText('Rozetka · 2')).toBeInTheDocument()
    expect(screen.getByText('Kalit (1 tugmali) · 1')).toBeInTheDocument()
    expect(screen.getByText('Devor A · 30 sm balandlikda')).toBeInTheDocument()
    expect(screen.getByText('Devor B · 110 sm balandlikda')).toBeInTheDocument()
  })

  it('takes one point off, and only that one', () => {
    useRoomStore.setState({ electricals: [point('1', 'socket1', 'A'), point('2', 'ac', 'C', 2200)] })
    render(<MontajSection />)
    fireEvent.click(screen.getByLabelText(/Konditsionerni olib tashlash/))
    expect(useRoomStore.getState().electricals.map((e) => e.id)).toEqual(['1'])
    expect(screen.queryByText(/Konditsioner ·/)).toBeNull()
  })
})
