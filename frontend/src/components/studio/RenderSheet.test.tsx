import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { RenderSheet } from './RenderSheet'

const createRender = vi.fn()
const waitForRender = vi.fn()
vi.mock('@/lib/api', () => ({
  createRender: (...a: unknown[]) => createRender(...a),
  waitForRender: (...a: unknown[]) => waitForRender(...a),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

function canvasRef(blob: Blob | null) {
  const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(blob) } as unknown as HTMLCanvasElement
  return { current: canvas }
}

beforeEach(() => { createRender.mockReset(); waitForRender.mockReset() })

describe('RenderSheet', () => {
  it('captures the canvas, queues the render and shows the result', async () => {
    createRender.mockResolvedValue({ job_id: 'j1' })
    waitForRender.mockResolvedValue('https://s3/r.jpg')
    render(<RenderSheet open onOpenChange={() => {}} glCanvasRef={canvasRef(new Blob(['x']))} />)

    fireEvent.click(screen.getByRole('button', { name: /Render qilish/ }))

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3/r.jpg'))
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
})
