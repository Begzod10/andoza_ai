import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { RenderSheet } from './RenderSheet'

const createRender = vi.fn()
const createRelight = vi.fn()
const waitForRender = vi.fn()
vi.mock('@/lib/api', () => ({
  createRender: (...a: unknown[]) => createRender(...a),
  createRelight: (...a: unknown[]) => createRelight(...a),
  waitForRender: (...a: unknown[]) => waitForRender(...a),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  LIGHTING_MOODS: ['midday_light', 'golden_light', 'blue_hour_light', 'ambient_light', 'warm_lamps', 'dimmed_mood'],
}))

function canvasRef(blob: Blob | null) {
  const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(blob) } as unknown as HTMLCanvasElement
  return { current: canvas }
}

const FIRST = { url: 'https://s3/r.jpg', key: 'renders/u/a.jpg', prompt: null }

async function renderOnce(outcome = FIRST) {
  createRender.mockResolvedValue({ job_id: 'j1' })
  waitForRender.mockResolvedValueOnce(outcome)
  render(<RenderSheet open onOpenChange={() => {}} glCanvasRef={canvasRef(new Blob(['x']))} />)
  fireEvent.click(screen.getByRole('button', { name: /Render qilish/ }))
  await waitFor(() => expect(screen.getByRole('img', { name: /Realistik render/ })).toBeInTheDocument())
}

beforeEach(() => { createRender.mockReset(); createRelight.mockReset(); waitForRender.mockReset() })

describe('RenderSheet', () => {
  it('captures the canvas, queues the render and shows the result', async () => {
    await renderOnce()
    expect(screen.getByRole('img', { name: /Realistik render/ })).toHaveAttribute('src', 'https://s3/r.jpg')
    expect(createRender).toHaveBeenCalledTimes(1)
    expect(waitForRender).toHaveBeenCalledWith('j1', expect.any(AbortSignal))
  })

  it('shows the reason when the render is refused', async () => {
    createRender.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))
    render(<RenderSheet open onOpenChange={() => {}} glCanvasRef={canvasRef(new Blob(['x']))} />)
    fireEvent.click(screen.getByRole('button', { name: /Render qilish/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
  })

  it('does not call the API when the canvas cannot be captured', async () => {
    render(<RenderSheet open onOpenChange={() => {}} glCanvasRef={canvasRef(null)} />)
    fireEvent.click(screen.getByRole('button', { name: /Render qilish/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(createRender).not.toHaveBeenCalled()
  })

  it('puts the generated prompt in the box, marked as automatic, when the user wrote none', async () => {
    await renderOnce({ ...FIRST, prompt: 'oak floor, white walls' })
    expect(screen.getByRole('textbox')).toHaveValue('oak floor, white walls')
    expect(screen.getByText(/Avtomatik tavsif/)).toBeInTheDocument()
  })

  it('keeps the users own prompt and does not call it automatic', async () => {
    createRender.mockResolvedValue({ job_id: 'j1' })
    waitForRender.mockResolvedValueOnce({ ...FIRST, prompt: 'warm oak' })
    render(<RenderSheet open onOpenChange={() => {}} glCanvasRef={canvasRef(new Blob(['x']))} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'warm oak' } })
    fireEvent.click(screen.getByRole('button', { name: /Render qilish/ }))
    await waitFor(() => expect(screen.getByRole('img', { name: /Realistik render/ })).toBeInTheDocument())
    expect(screen.getByRole('textbox')).toHaveValue('warm oak')
    expect(screen.queryByText(/Avtomatik tavsif/)).toBeNull()
  })

  it('offers lighting only once there is a render', async () => {
    render(<RenderSheet open onOpenChange={() => {}} glCanvasRef={canvasRef(new Blob(['x']))} />)
    expect(screen.queryByRole('button', { name: 'Iliq chiroqlar' })).toBeNull()
    await renderOnce()
    expect(screen.getByRole('button', { name: 'Iliq chiroqlar' })).toBeInTheDocument()
  })

  it('relights from the shown render, adds the result as a version and can step back', async () => {
    await renderOnce()
    createRelight.mockResolvedValue({ job_id: 'j2' })
    waitForRender.mockResolvedValueOnce({ url: 'https://s3/lit.jpg', key: 'renders/u/b.jpg', prompt: null })

    fireEvent.click(screen.getByRole('button', { name: 'Iliq chiroqlar' }))

    await waitFor(() => expect(screen.getByRole('img', { name: /Realistik render/ })).toHaveAttribute('src', 'https://s3/lit.jpg'))
    expect(createRelight).toHaveBeenCalledWith('renders/u/a.jpg', 'warm_lamps')
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    fireEvent.click(screen.getByRole('tab', { name: /Asl/ }))
    expect(screen.getByRole('img', { name: /Realistik render/ })).toHaveAttribute('src', 'https://s3/r.jpg')
  })

  it('keeps the render and shows the reason when a relight fails', async () => {
    await renderOnce()
    createRelight.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))

    fireEvent.click(screen.getByRole('button', { name: 'Kunduzgi' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
    expect(screen.getByRole('img', { name: /Realistik render/ })).toHaveAttribute('src', 'https://s3/r.jpg')
  })
})
