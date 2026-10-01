/**
 * The shop-model cards in the Mebel panel. The panel rebuilds each card's data
 * field by field, so a field added to the entry has to be carried across by hand:
 * the shop's call / Telegram buttons were once built, unit-tested and still never
 * showed, because that hand-off was missing. This renders the real panel and checks
 * the buttons reach the card.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MebelSection } from './MebelSection'
import { useRoomStore } from '@/store/roomStore'

const getStores = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (orig) => ({ ...(await orig<object>()), getStores: (...a: unknown[]) => getStores(...a) }))
// No WebGL / IndexedDB in the test environment; the cards do not need either.
vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(() => ({}), { preload: () => {}, clear: () => {} }) }))
vi.mock('@/lib/modelDb', () => ({
  getModelFromDb: vi.fn().mockResolvedValue(null),
  saveModelToDb: vi.fn(),
  deleteModelFromDb: vi.fn(),
  arrayBufferToBlobUrl: vi.fn(),
}))

const model = (over: Record<string, unknown> = {}) => ({
  id: 'm1', store_id: 's1', store_name: 'Hamkor Qurilish', category: 'karavot', room_type: null,
  placement: 'pol' as const, name_uz: 'Karavot 1', price_uzs: 4_500_000, glb_url: 'https://x/m.glb',
  thumbnail_url: null, footprint_w: 232, footprint_d: 197, ...over,
})
const shop = (over: Record<string, unknown> = {}) => ({
  id: 's1', name: 'Hamkor Qurilish', district: null, phone: '+998901234567', telegram: null,
  logo_color: null, partner_tier: 'standard', ...over,
})

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MebelSection /></QueryClientProvider>)
}

beforeEach(() => {
  getStores.mockReset()
  useRoomStore.getState().setCatalogFurniture([])
})

describe('Mebel panel — shop contact on a model card', () => {
  it("puts a call button on a shop's model once the shop list arrives", async () => {
    getStores.mockResolvedValue([shop()])
    useRoomStore.getState().setCatalogFurniture([model()])
    renderPanel()

    const call = await screen.findByRole('link', { name: /Qo'ng'iroq qilish/ })
    expect(call).toHaveAttribute('href', 'tel:+998901234567')
    expect(screen.queryByRole('link', { name: /Telegramda yozish/ })).toBeNull() // that shop gave no Telegram
  })

  it('offers both call and Telegram when the shop has both', async () => {
    getStores.mockResolvedValue([shop({ telegram: '@mebelplus' })])
    useRoomStore.getState().setCatalogFurniture([model()])
    renderPanel()

    expect(await screen.findByRole('link', { name: /Telegramda yozish/ })).toHaveAttribute('href', 'https://t.me/mebelplus')
    expect(screen.getByRole('link', { name: /Qo'ng'iroq qilish/ })).toBeInTheDocument()
  })

  it('shows no buttons for a model whose shop has no usable contact, nor for one with no shop', async () => {
    getStores.mockResolvedValue([shop({ phone: null, telegram: 'javascript:alert(1)' })])
    useRoomStore.getState().setCatalogFurniture([model(), model({ id: 'm2', store_id: null, store_name: null, name_uz: 'Divan' })])
    renderPanel()

    await screen.findByText('Karavot 1')
    await waitFor(() => expect(getStores).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Qo'ng'iroq|Telegramda/ })).toBeNull()
  })

  it('still lists the models while the shop list is loading or fails', async () => {
    getStores.mockRejectedValue(new Error('offline'))
    useRoomStore.getState().setCatalogFurniture([model()])
    renderPanel()
    expect(await screen.findByText('Karavot 1')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Qo'ng'iroq/ })).toBeNull()
  })

  it('has no way to add a model: only sellers and admins add models, not studio users', async () => {
    getStores.mockResolvedValue([])
    useRoomStore.getState().setCatalogFurniture([model()])
    const { container } = renderPanel()
    await screen.findByText('Karavot 1')

    expect(screen.queryByText(/Model yuklash/)).toBeNull()
    expect(screen.queryByText(/Rasmdan 3D model/)).toBeNull()
    expect(screen.queryByText(/Papka orqali/)).toBeNull()
    // The only file input left is the one for skinning a model with an image.
    const fileInputs = [...container.querySelectorAll<HTMLInputElement>('input[type=file]')]
    expect(fileInputs.every((i) => i.accept === 'image/*')).toBe(true)
  })
})
