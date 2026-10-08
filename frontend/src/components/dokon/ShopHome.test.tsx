import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShopHome } from './ShopHome'

const listCatalogFurniture = vi.fn()
const getMaterials = vi.fn()
vi.mock('@/lib/api', () => ({
  listCatalogFurniture: (...a: unknown[]) => listCatalogFurniture(...a),
  getMaterials: (...a: unknown[]) => getMaterials(...a),
}))

const F = (id: string, name: string, category: string, price: number | null, store = 'Mebel Plaza') => ({
  id, name_uz: name, category, price_uzs: price, store_name: store, thumbnail_url: null, store_id: null,
  room_type: null, placement: 'pol', glb_url: 'x.glb', footprint_w: 100, footprint_d: 50,
})
const M = (id: string, name: string, category: string, price: number) => ({
  id, name_uz: name, category, price_uzs: price, unit: 'litr', color_hex: '#ffffff', store_id: 's', texture_key: null, pbr_roughness: 0.5,
})

function mount(props: Partial<React.ComponentProps<typeof ShopHome>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onProductSelect = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <ShopHome cartCount={0} onCart={() => {}} onProductSelect={onProductSelect} {...props} />
    </QueryClientProvider>,
  )
  return { onProductSelect }
}

beforeEach(() => {
  listCatalogFurniture.mockReset().mockResolvedValue({
    items: [F('1', 'Divan 2', 'divan', 4_500_000), F('2', 'Stol 1', 'stol', 1_850_000), F('3', 'Kreslo', 'boshqa', null)],
    total: 3, page: 1, per_page: 100,
  })
  getMaterials.mockReset().mockResolvedValue([M('m1', "Akril bo'yoq", 'boyoq', 45_000), M('m2', 'Laminat', 'laminat', 180_000)])
})

describe('ShopHome', () => {
  it('shows the first piece large, with its price and shop, and the rest as cards', async () => {
    mount()
    expect(await screen.findByRole('button', { name: /Divan 2, 4\s500\s000/ })).toBeInTheDocument()
    expect(screen.getByText('Divan · Mebel Plaza')).toBeInTheDocument() // the featured card's line, upper-cased by CSS
    expect(screen.getByRole('button', { name: /Stol 1, 1\s850\s000/ })).toBeInTheDocument()
  })

  it('says "ask for the price" for an item with none, never "0 soʻm"', async () => {
    mount()
    expect(await screen.findByRole('button', { name: /Kreslo, Narx so'rang/ })).toBeInTheDocument()
  })

  it('filters by category, and clears the filter on a second press', async () => {
    mount()
    await screen.findByRole('button', { name: /Divan 2/ })
    fireEvent.click(screen.getByRole('button', { name: 'Stol' }))
    expect(screen.queryByRole('button', { name: /Divan 2/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Stol 1/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stol' }))
    expect(screen.getByRole('button', { name: /Divan 2/ })).toBeInTheDocument()
  })

  it('searches the furniture by name', async () => {
    mount()
    await screen.findByRole('button', { name: /Divan 2/ })
    fireEvent.change(screen.getByLabelText('Qidirish'), { target: { value: 'stol' } })
    expect(screen.queryByRole('button', { name: /Divan 2/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Stol 1/ })).toBeInTheDocument()
  })

  it('switches to the materials, with their unit and price, and asks the server only then', async () => {
    mount()
    await screen.findByRole('button', { name: /Divan 2/ })
    expect(getMaterials).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Materiallar' }))
    expect(await screen.findByRole('button', { name: /Akril bo'yoq, 45\s000/ })).toBeInTheDocument()
    expect(screen.getByText("Bo'yoq · litr")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Divan 2/ })).toBeNull()
  })

  it('hands the chosen product to the page, and shows the basket count', async () => {
    const { onProductSelect } = mount({ cartCount: 3 })
    expect(screen.getByRole('button', { name: /Savat \(3\)/ })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Stol 1/ }))
    expect(onProductSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }))
  })

  it('says the catalog did not load, rather than showing an empty shop', async () => {
    listCatalogFurniture.mockReset().mockRejectedValue(new Error('Failed to fetch'))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Katalog yuklanmadi')
    expect(screen.queryByText('Hech narsa topilmadi.')).toBeNull()
  })

  it('says nothing was found when the catalog is empty', async () => {
    listCatalogFurniture.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, per_page: 100 })
    mount()
    await waitFor(() => expect(screen.getByText('Hech narsa topilmadi.')).toBeInTheDocument())
  })
})
