import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MaterialFormDialog } from './MaterialFormDialog'
import type { AdminMaterial } from '@/lib/api'

const api = vi.hoisted(() => ({ createAdminMaterial: vi.fn(), updateAdminMaterial: vi.fn() }))
vi.mock('@/lib/api', async () => {
  const consts = await vi.importActual<typeof import('@/lib/api/adminMaterials')>('@/lib/api/adminMaterials')
  return {
    MATERIAL_CATEGORIES: consts.MATERIAL_CATEGORIES,
    MATERIAL_UNITS: consts.MATERIAL_UNITS,
    SMETA_KEYS: consts.SMETA_KEYS,
    PACK_UNITS: consts.PACK_UNITS,
    createAdminMaterial: (...a: unknown[]) => api.createAdminMaterial(...a),
    updateAdminMaterial: (...a: unknown[]) => api.updateAdminMaterial(...a),
  }
})

const stores = [{ id: 's1', name: 'Qurilish Mart' }, { id: 's2', name: 'Bobur Do\'kon' }] as never

const existing: AdminMaterial = {
  id: 'm1', store_id: 's1', store_name: 'Qurilish Mart', category: 'gips', name_uz: 'Gips suvoq',
  unit: 'qop', price_uzs: 125000, pack_qty: 30, pack_unit: 'kg', smeta_key: 'suvoq',
  roll_width_cm: null, roll_length_m: null, color_hex: null, image_url: null, is_active: true,
}

function mount(material: AdminMaterial | null = null, onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MaterialFormDialog open onOpenChange={() => {}} material={material} stores={stores} onSaved={onSaved} />
    </QueryClientProvider>,
  )
  return { onSaved }
}
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => screen.getByRole('button', { name: 'Saqlash' })

function fillRequired() {
  set("Do'kon", 's1')
  set('Kategoriya', 'gips')
  set('Nomi', '  Gips suvoq ')
  set('Birlik', 'qop')
  set("Narxi (so'm)", '125000')
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.createAdminMaterial.mockResolvedValue({})
  api.updateAdminMaterial.mockResolvedValue({})
})

describe('MaterialFormDialog create', () => {
  it('sends numbers as numbers and empty optional fields as null', async () => {
    const { onSaved } = mount()
    fillRequired()
    fireEvent.click(save())
    await waitFor(() => expect(api.createAdminMaterial).toHaveBeenCalled())
    expect(api.createAdminMaterial).toHaveBeenCalledWith({
      store_id: 's1', category: 'gips', name_uz: 'Gips suvoq', unit: 'qop', price_uzs: 125000,
      pack_qty: null, pack_unit: null, smeta_key: null, roll_width_cm: null, roll_length_m: null,
    })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  it('sends pack and smeta key when filled', async () => {
    mount()
    fillRequired()
    set('Qadoq hajmi', '30')
    set('Smeta kaliti', 'suvoq')
    fireEvent.click(save())
    await waitFor(() => expect(api.createAdminMaterial).toHaveBeenCalled())
    expect(api.createAdminMaterial.mock.calls[0][0]).toMatchObject({ pack_qty: 30, pack_unit: 'kg', smeta_key: 'suvoq' })
  })
})

describe('MaterialFormDialog edit', () => {
  it('opens filled and saves through updateAdminMaterial', async () => {
    mount(existing)
    expect(screen.getByLabelText('Nomi')).toHaveValue('Gips suvoq')
    expect(screen.getByLabelText("Narxi (so'm)")).toHaveValue(125000)
    set('Nomi', 'Gips suvoq 30kg')
    fireEvent.click(save())
    await waitFor(() => expect(api.updateAdminMaterial).toHaveBeenCalled())
    const [id, patch] = api.updateAdminMaterial.mock.calls[0]
    expect(id).toBe('m1')
    expect(patch).toMatchObject({ name_uz: 'Gips suvoq 30kg', price_uzs: 125000, pack_qty: 30, pack_unit: 'kg', smeta_key: 'suvoq' })
    expect(api.createAdminMaterial).not.toHaveBeenCalled()
  })
})

describe('MaterialFormDialog pack unit', () => {
  it('fills the pack unit from the smeta key when it is empty', () => {
    mount()
    set('Smeta kaliti', 'suvoq')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('kg')
  })

  it('never overwrites a pack unit the user entered, even after the key is removed and re-picked', () => {
    mount()
    set('Qadoq birligi', 'litr')
    set('Smeta kaliti', 'suvoq')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('litr')
    set('Smeta kaliti', '')
    set('Smeta kaliti', 'plintus')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('litr')
  })

  it('replaces a unit the previous key filled, but not one the user picked', () => {
    mount()
    set('Smeta kaliti', 'suvoq')
    set('Smeta kaliti', 'plintus')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('m')
    set('Smeta kaliti', 'kabel')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('')
  })

  it('keeps a picked unit when another key is chosen', () => {
    mount()
    set('Qadoq birligi', 'litr')
    set('Smeta kaliti', 'suvoq')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('litr')
  })

  it('blocks Saqlash when only one of pack size and unit is filled', () => {
    mount()
    fillRequired()
    set('Qadoq hajmi', '30')
    expect(save()).toBeDisabled()
    set('Qadoq birligi', 'kg')
    expect(save()).toBeEnabled()
    set('Qadoq hajmi', '')
    expect(save()).toBeDisabled()
  })

  it('does not autofill a pack unit when the sale unit already is the key unit', () => {
    mount()
    fillRequired()
    set('Birlik', 'm')
    set('Smeta kaliti', 'plintus')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('')
    expect(save()).toBeEnabled()
  })

  it('still autofills the pack unit when the sale unit differs from the key unit', () => {
    mount()
    set('Birlik', 'dona')
    set('Smeta kaliti', 'plintus')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('m')
  })

  it('clears an autofilled pack unit when the sale unit becomes the key unit', () => {
    mount()
    set('Smeta kaliti', 'plintus')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('m')
    set('Birlik', 'm')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('')
  })

  it('leaves the pack unit empty for a key without one', () => {
    mount()
    set('Smeta kaliti', 'kabel')
    expect(screen.getByLabelText('Qadoq birligi')).toHaveValue('')
  })
})

describe('MaterialFormDialog roll size', () => {
  it('shows roll fields only for oboy', async () => {
    mount()
    expect(screen.queryByLabelText('Rulon eni (sm)')).not.toBeInTheDocument()
    set('Kategoriya', 'oboy')
    expect(screen.getByLabelText('Rulon eni (sm)')).toBeInTheDocument()
    expect(screen.getByLabelText('Rulon uzunligi (m)')).toBeInTheDocument()
    fillRequired()
    set('Kategoriya', 'oboy')
    set('Rulon eni (sm)', '106')
    set('Rulon uzunligi (m)', '10.5')
    fireEvent.click(save())
    await waitFor(() => expect(api.createAdminMaterial).toHaveBeenCalled())
    expect(api.createAdminMaterial.mock.calls[0][0]).toMatchObject({ roll_width_cm: 106, roll_length_m: 10.5 })
  })

  it('sends null roll size once the category is not oboy', async () => {
    mount()
    fillRequired()
    set('Kategoriya', 'oboy')
    set('Rulon eni (sm)', '106')
    set('Kategoriya', 'gips')
    fireEvent.click(save())
    await waitFor(() => expect(api.createAdminMaterial).toHaveBeenCalled())
    expect(api.createAdminMaterial.mock.calls[0][0]).toMatchObject({ roll_width_cm: null, roll_length_m: null })
  })
})

describe('MaterialFormDialog validation', () => {
  it.each([[''], ['0'], ['-5']])('blocks Saqlash for price %j', (price) => {
    mount()
    fillRequired()
    expect(save()).toBeEnabled()
    set("Narxi (so'm)", price)
    expect(save()).toBeDisabled()
    fireEvent.click(save())
    expect(api.createAdminMaterial).not.toHaveBeenCalled()
  })

  it('blocks Saqlash while name or shop is missing', () => {
    mount()
    expect(save()).toBeDisabled()
    fillRequired()
    set('Nomi', '   ')
    expect(save()).toBeDisabled()
  })
})

describe('MaterialFormDialog backend errors', () => {
  it('shows a string detail inside the dialog', async () => {
    api.createAdminMaterial.mockRejectedValue(new Error('{"detail":"Bunday smeta kaliti yo\'q"}'))
    mount()
    fillRequired()
    fireEvent.click(save())
    expect(await screen.findByText("Bunday smeta kaliti yo'q")).toBeInTheDocument()
  })

  it('shows the msg of a list-shaped detail, not raw JSON', async () => {
    api.createAdminMaterial.mockRejectedValue(new Error('{"detail":[{"loc":["body","price_uzs"],"msg":"Input should be greater than 0","type":"x"}]}'))
    mount()
    fillRequired()
    fireEvent.click(save())
    expect(await screen.findByText('Input should be greater than 0')).toBeInTheDocument()
  })
})
