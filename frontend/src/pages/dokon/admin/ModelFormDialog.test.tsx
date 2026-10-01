import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelFormDialog } from './ModelFormDialog'

const api = vi.hoisted(() => ({
  uploadAdminFurniture: vi.fn(),
  createPhotoModel: vi.fn(),
  waitForRender: vi.fn(),
  fetchPhotoModelGlb: vi.fn(),
}))
vi.mock('@/lib/api', () => ({
  ...Object.fromEntries(Object.entries(api).map(([k, v]) => [k, (...a: unknown[]) => v(...a)])),
  ADMIN_FURNITURE_CATEGORIES: ['divan', 'stol'],
  ADMIN_ROOM_TYPES: ['mehmonxona'],
  ADMIN_PLACEMENTS: ['pol', 'devor', 'shift'],
}))
vi.mock('./ModelPreview3D', () => ({ ModelPreview3D: () => null })) // needs WebGL

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ModelFormDialog open onOpenChange={() => {}} stores={[]} onError={() => {}} />
    </QueryClientProvider>,
  )
  return screen.getByLabelText('Rasmdan 3D model yaratish')
}
const photo = () => new File(['x'], 'karavot.jpg', { type: 'image/jpeg' })
const submit = () => screen.getByRole('button', { name: 'Yuklash' })

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

describe('admin 3D model dialog — build the model from a photo', () => {
  it('offers the photo option', () => {
    open()
    expect(screen.getByText(/Rasmdan yarating/)).toBeInTheDocument()
  })

  it('turns the photo into the model, names it after the photo and uses the photo as its picture', async () => {
    api.createPhotoModel.mockResolvedValue({ job_id: 'j1' })
    api.waitForRender.mockResolvedValue({ url: 'u', key: 'photo-models/u/m.glb', prompt: null })
    api.fetchPhotoModelGlb.mockResolvedValue(new Blob(['glb']))
    api.uploadAdminFurniture.mockResolvedValue({})
    const input = open()
    expect(submit()).toBeDisabled()

    fireEvent.change(input, { target: { files: [photo()] } })

    await waitFor(() => expect(screen.getByLabelText('Nomi')).toHaveValue('karavot'))
    await waitFor(() => expect(submit()).toBeEnabled())
    expect(api.fetchPhotoModelGlb).toHaveBeenCalledWith('photo-models/u/m.glb')

    fireEvent.click(submit())
    await waitFor(() => expect(api.uploadAdminFurniture).toHaveBeenCalled())
    const sent = api.uploadAdminFurniture.mock.calls[0][0]
    expect(sent.file.name).toBe('karavot.glb')
    expect(sent.thumbnail.name).toBe('karavot.jpg')
    expect(sent.name_uz).toBe('karavot')
  })

  it('keeps a name the admin already typed', async () => {
    api.createPhotoModel.mockResolvedValue({ job_id: 'j1' })
    api.waitForRender.mockResolvedValue({ url: 'u', key: 'k', prompt: null })
    api.fetchPhotoModelGlb.mockResolvedValue(new Blob(['glb']))
    const input = open()
    fireEvent.change(screen.getByLabelText('Nomi'), { target: { value: "Ikki o'rinli karavot" } })
    fireEvent.change(input, { target: { files: [photo()] } })
    await waitFor(() => expect(submit()).toBeEnabled())
    expect(screen.getByLabelText('Nomi')).toHaveValue("Ikki o'rinli karavot")
  })

  it('shows progress and blocks submitting while it builds', async () => {
    api.createPhotoModel.mockResolvedValue({ job_id: 'j1' })
    api.waitForRender.mockReturnValue(new Promise(() => {}))
    const input = open()
    fireEvent.change(screen.getByLabelText('Nomi'), { target: { value: 'Karavot' } })
    fireEvent.change(input, { target: { files: [photo()] } })
    expect(await screen.findByRole('status')).toHaveTextContent('Model yaratilmoqda')
    expect(submit()).toBeDisabled()
    expect(input).toBeDisabled()
  })

  it('says why when it fails, and leaves the form usable', async () => {
    api.createPhotoModel.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))
    const input = open()
    fireEvent.change(input, { target: { files: [photo()] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('limiti tugadi')
    expect(input).toBeEnabled()
  })

  it('refuses a photo over 20 MB without calling the server', async () => {
    const input = open()
    const big = photo()
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [big] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('20 MB')
    expect(api.createPhotoModel).not.toHaveBeenCalled()
  })
})
