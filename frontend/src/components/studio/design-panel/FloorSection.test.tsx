import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRoomStore } from '@/store/roomStore'
import { FloorSection } from './FloorSection'

vi.mock('@/lib/api', () => ({ listWallpapers: vi.fn().mockResolvedValue([]), uploadWallpaper: vi.fn() }))

function renderFloor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><FloorSection onSetFloorType={() => {}} /></QueryClientProvider>)
}
// Only the floor-type buttons (the Naqsh and Plintus groups use the same selected style).
const TYPES = ['Parket', 'Kafel', 'Laminat', 'Beton']
const selected = () =>
  screen.getAllByRole('button').filter((b) => TYPES.includes(b.textContent ?? '') && b.className.includes('border-brand bg-brand/10'))

beforeEach(() => {
  useRoomStore.setState((s) => ({ designState: { ...s.designState, floorType: 'parquet', floorConfigured: false, floorTexture: null, floorPattern: null } }))
})

describe('FloorSection', () => {
  it('shows no floor type as chosen before one was, and says so', () => {
    renderFloor()
    expect(selected()).toHaveLength(0)
    expect(screen.getByText(/Pol hali tanlanmagan/)).toBeInTheDocument()
  })

  it('highlights the chosen type once the floor is configured, and drops the hint', () => {
    useRoomStore.setState((s) => ({ designState: { ...s.designState, floorType: 'parquet', floorConfigured: true } }))
    renderFloor()
    expect(selected()).toHaveLength(1)
    expect(selected()[0].textContent).toBe('Parket')
    expect(screen.queryByText(/Pol hali tanlanmagan/)).toBeNull()
  })
})
