import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PhotoModelButton } from './PhotoModelButton'

const createPhotoModel = vi.fn()
const fetchPhotoModelGlb = vi.fn()
const waitForRender = vi.fn()
const importFiles = vi.fn()
vi.mock('@/lib/api', () => ({
  createPhotoModel: (...a: unknown[]) => createPhotoModel(...a),
  fetchPhotoModelGlb: (...a: unknown[]) => fetchPhotoModelGlb(...a),
  waitForRender: (...a: unknown[]) => waitForRender(...a),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))
vi.mock('@/hooks/useModelImport', () => ({ useModelImport: () => ({ importFiles }) }))

function pick(file: File) {
  const input = document.querySelector('input[type=file]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

const photo = () => new File(['x'], 'sofa.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  createPhotoModel.mockReset(); fetchPhotoModelGlb.mockReset(); waitForRender.mockReset(); importFiles.mockReset()
})

describe('PhotoModelButton', () => {
  it('builds a model from the photo and imports the GLB under the open category', async () => {
    createPhotoModel.mockResolvedValue({ job_id: 'j1' })
    waitForRender.mockResolvedValue({ url: 'https://s3/m.glb', key: 'photo-models/u/m.glb', prompt: null })
    fetchPhotoModelGlb.mockResolvedValue(new Blob(['glb']))
    importFiles.mockResolvedValue('new-id')
    render(<PhotoModelButton category="divan" />)

    pick(photo())

    await waitFor(() => expect(screen.getByText("Model qo'shildi")).toBeInTheDocument())
    expect(createPhotoModel).toHaveBeenCalledTimes(1)
    expect(waitForRender).toHaveBeenCalledWith('j1', expect.any(AbortSignal))
    expect(fetchPhotoModelGlb).toHaveBeenCalledWith('photo-models/u/m.glb')
    const [files, category] = importFiles.mock.calls[0]
    expect(files[0].name).toBe('sofa.glb')
    expect(category).toBe('divan')
  })

  it('shows progress while the server builds', async () => {
    createPhotoModel.mockResolvedValue({ job_id: 'j1' })
    waitForRender.mockReturnValue(new Promise(() => {}))
    render(<PhotoModelButton />)
    pick(photo())
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Model yaratilmoqda'))
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows the reason when the build is refused or fails', async () => {
    createPhotoModel.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))
    render(<PhotoModelButton />)
    pick(photo())
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
    expect(importFiles).not.toHaveBeenCalled()
  })

  it('fails when the import does not register the model', async () => {
    createPhotoModel.mockResolvedValue({ job_id: 'j1' })
    waitForRender.mockResolvedValue({ url: 'u', key: 'k', prompt: null })
    fetchPhotoModelGlb.mockResolvedValue(new Blob(['glb']))
    importFiles.mockResolvedValue(null)
    render(<PhotoModelButton />)
    pick(photo())
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('refuses a photo over 20 MB without calling the server', async () => {
    render(<PhotoModelButton />)
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    pick(big)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('20 MB'))
    expect(createPhotoModel).not.toHaveBeenCalled()
  })

  it('only offers photo formats Tripo accepts', () => {
    render(<PhotoModelButton />)
    expect((document.querySelector('input[type=file]') as HTMLInputElement).accept).toBe('image/jpeg,image/png,image/webp')
  })
})
