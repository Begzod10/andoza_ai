import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CatalogOverview } from './CatalogOverview'

const api = vi.hoisted(() => ({
  classifyFurnitureStyles: vi.fn(),
  listAdminFurniture: vi.fn(),
  listAdminStores: vi.fn(),
  listWallpapers: vi.fn(),
  deleteAdminFurniture: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  ...Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])),
}))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('./WallpaperSection', () => ({ WallpaperSection: () => null }))
vi.mock('./StoreFormDialog', () => ({ StoreFormDialog: () => null }))
vi.mock('./ModelFormDialog', () => ({ ModelFormDialog: () => null }))
vi.mock('./ModelEditDialog', () => ({ ModelEditDialog: () => null }))

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <CatalogOverview onError={() => {}} onSelectStore={() => {}} />
    </QueryClientProvider>,
  )
}

const BTN = "AI bilan uslub qo'yish"

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.listAdminFurniture.mockResolvedValue([])
  api.listAdminStores.mockResolvedValue([])
  api.listWallpapers.mockResolvedValue([])
})

describe('CatalogOverview — AI style pass', () => {
  it('queues the pass once and reports how many models', async () => {
    api.classifyFurnitureStyles.mockResolvedValue({ queued: 4 })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: BTN }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      "4 ta model navbatga qo'yildi. Bir necha daqiqada uslublar paydo bo'ladi.",
    )
    expect(api.classifyFurnitureStyles).toHaveBeenCalledTimes(1)
  })

  it('says so when no model needs styles', async () => {
    api.classifyFurnitureStyles.mockResolvedValue({ queued: 0 })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: BTN }))
    expect(await screen.findByText("Uslubi qo'yilmagan model yo'q.")).toBeInTheDocument()
  })

  it('blocks a second click while the request is pending', async () => {
    let resolve!: (v: { queued: number }) => void
    api.classifyFurnitureStyles.mockReturnValue(new Promise((r) => { resolve = r }))
    renderIt()
    const btn = await screen.findByRole('button', { name: BTN })
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    fireEvent.click(btn)
    expect(api.classifyFurnitureStyles).toHaveBeenCalledTimes(1)
    resolve({ queued: 1 })
    await waitFor(() => expect(btn).not.toBeDisabled())
  })
})
