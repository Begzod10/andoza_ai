import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Image3DConverter } from '@/components/studio/Image3DConverter'
import * as api from '@/lib/api'

// Mock the API
vi.mock('@/lib/api', () => ({
  convertImageTo3D: vi.fn(),
  waitForMeshyTask: vi.fn(),
}))

describe('Image3DConverter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the component', () => {
    render(<Image3DConverter />)
    expect(screen.getByText(/Rasm URL/i)).toBeInTheDocument()
  })

  it('renders input field for image URL', () => {
    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/)
    expect(input).toBeInTheDocument()
  })

  it('renders convert button', () => {
    render(<Image3DConverter />)
    const button = screen.getByRole('button', { name: /3D yaratish/i })
    expect(button).toBeInTheDocument()
  })

  it('disables button when input is empty', () => {
    render(<Image3DConverter />)
    const button = screen.getByRole('button', { name: /3D yaratish/i })
    expect(button).toBeDisabled()
  })

  it('enables button when URL is provided', () => {
    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })

    expect(button).not.toBeDisabled()
  })

  it('shows error for invalid URL format', async () => {
    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'not-a-url' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/Rasm URL kiriting/i)).toBeInTheDocument()
    })
  })

  it('calls API when convert button clicked', async () => {
    const mockConvert = vi.fn().mockResolvedValue({
      task_id: 'task-123',
      status: 'RUNNING',
      model_urls: {},
    })
    vi.mocked(api.convertImageTo3D).mockImplementation(mockConvert)

    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockConvert).toHaveBeenCalledWith({
        image_url: 'https://example.com/room.jpg',
        enable_pbr: true,
        wait_for_completion: false,
      })
    })
  })

  it('shows processing state after conversion starts', async () => {
    vi.mocked(api.convertImageTo3D).mockResolvedValue({
      task_id: 'task-123',
      status: 'RUNNING',
      model_urls: {},
    })
    vi.mocked(api.waitForMeshyTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: 'https://meshy.ai/download/model.glb' },
      message: 'Success',
    })

    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/3D model yaratilmoqda/i)).toBeInTheDocument()
    })
  })

  it('shows success message when conversion completes', async () => {
    vi.mocked(api.convertImageTo3D).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: 'https://meshy.ai/download/model.glb' },
    })
    vi.mocked(api.waitForMeshyTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: 'https://meshy.ai/download/model.glb' },
      message: 'Success',
    })

    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/3D model tayyor/i)).toBeInTheDocument()
    })
  })

  it('provides download link when complete', async () => {
    const modelUrl = 'https://meshy.ai/download/model.glb'
    vi.mocked(api.convertImageTo3D).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: modelUrl },
    })
    vi.mocked(api.waitForMeshyTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: modelUrl },
      message: 'Success',
    })

    render(<Image3DConverter onModelReady={vi.fn()} />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(button)

    await waitFor(() => {
      const downloadLink = screen.getByText(/GLB yuklash/i)
      expect(downloadLink).toHaveAttribute('href', modelUrl)
    })
  })

  it('calls onModelReady callback when model is ready', async () => {
    const modelUrl = 'https://meshy.ai/download/model.glb'
    const onModelReady = vi.fn()

    vi.mocked(api.convertImageTo3D).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: modelUrl },
    })
    vi.mocked(api.waitForMeshyTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: modelUrl },
      message: 'Success',
    })

    render(<Image3DConverter onModelReady={onModelReady} />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(onModelReady).toHaveBeenCalledWith(modelUrl, 'glb')
    })
  })

  it('shows error message on API failure', async () => {
    const errorMessage = 'Image quality too low'
    const onError = vi.fn()

    vi.mocked(api.convertImageTo3D).mockResolvedValue({
      task_id: 'task-fail',
      status: 'FAILED',
      model_urls: {},
      message: errorMessage,
    })
    vi.mocked(api.waitForMeshyTask).mockResolvedValue({
      task_id: 'task-fail',
      status: 'FAILED',
      model_urls: {},
      message: errorMessage,
    })

    render(<Image3DConverter onError={onError} />)
    const input = screen.getByPlaceholderText(/example.com/)
    const button = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(errorMessage)
    })
  })

  it('allows resetting after completion', async () => {
    vi.mocked(api.convertImageTo3D).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: 'https://meshy.ai/download/model.glb' },
    })
    vi.mocked(api.waitForMeshyTask).mockResolvedValue({
      task_id: 'task-123',
      status: 'SUCCEEDED',
      model_urls: { glb: 'https://meshy.ai/download/model.glb' },
      message: 'Success',
    })

    render(<Image3DConverter />)
    const input = screen.getByPlaceholderText(/example.com/) as HTMLInputElement
    const convertButton = screen.getByRole('button', { name: /3D yaratish/i })

    fireEvent.change(input, { target: { value: 'https://example.com/room.jpg' } })
    fireEvent.click(convertButton)

    await waitFor(() => {
      expect(screen.getByText(/3D model tayyor/i)).toBeInTheDocument()
    })

    const resetButton = screen.getByRole('button', { name: /Tozalash/i })
    fireEvent.click(resetButton)

    expect(input.value).toBe('')
    expect(input).not.toBeDisabled()
  })
})
