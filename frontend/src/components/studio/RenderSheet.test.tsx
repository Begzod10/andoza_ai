import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { RenderSheet } from './RenderSheet'

const createRender = vi.fn()
const createRelight = vi.fn()
const createUpscale = vi.fn()
const waitForRender = vi.fn()
const listRenders = vi.fn()
vi.mock('@/lib/api', () => ({
  createRender: (...a: unknown[]) => createRender(...a),
  createRelight: (...a: unknown[]) => createRelight(...a),
  createUpscale: (...a: unknown[]) => createUpscale(...a),
  waitForRender: (...a: unknown[]) => waitForRender(...a),
  listRenders: (...a: unknown[]) => listRenders(...a),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  LIGHTING_MOODS: ['midday_light', 'golden_light', 'blue_hour_light', 'ambient_light', 'warm_lamps', 'dimmed_mood'],
}))

const panoramaJpeg = vi.fn()
vi.mock('@/lib/panoramaSnap', () => ({ panoramaJpeg: (...a: unknown[]) => panoramaJpeg(...a) }))
// The viewer needs WebGL; the sheet only needs to hand it the picture.
vi.mock('./PanoramaViewer', () => ({
  PanoramaViewer: ({ src }: { src: string }) => <div data-testid="pano-viewer" data-src={src} />,
}))

const FIRST = { url: 'https://s3/r.jpg', key: 'renders/u/a.jpg', prompt: null }

/** Opening the sheet is what starts the render: the 360 camera's button opens it. */
async function renderOnce(outcome = FIRST) {
  panoramaJpeg.mockResolvedValue(new Blob(['pano']))
  createRender.mockResolvedValue({ job_id: 'j1' })
  waitForRender.mockResolvedValueOnce(outcome)
  render(<RenderSheet open onOpenChange={() => {}} />)
  await screen.findByTestId('pano-viewer')
}

async function renderOnceWith(roomId: string) {
  panoramaJpeg.mockResolvedValue(new Blob(['pano']))
  createRender.mockResolvedValue({ job_id: 'j1' })
  waitForRender.mockResolvedValueOnce(FIRST)
  render(<RenderSheet open onOpenChange={() => {}} roomId={roomId} />)
  await screen.findByTestId('pano-viewer')
}

beforeEach(() => { createRender.mockReset(); createRelight.mockReset(); createUpscale.mockReset(); waitForRender.mockReset(); panoramaJpeg.mockReset(); listRenders.mockReset(); listRenders.mockResolvedValue([]) })

describe('RenderSheet', () => {
  it('takes the panorama and renders it as soon as it opens, with no button pressed', async () => {
    await renderOnce()
    expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/r.jpg')
    expect(panoramaJpeg).toHaveBeenCalledTimes(1)
    expect(createRender).toHaveBeenCalledTimes(1)
    expect(createRender.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(waitForRender).toHaveBeenCalledWith('j1', expect.any(AbortSignal))
  })

  it('sends the room id so the picture is saved against it', async () => {
    await renderOnceWith('room-7')
    expect(createRender).toHaveBeenCalledWith(expect.any(Blob), '', 'room-7')
  })

  it('lists the saved renders of the room and shows one when tapped', async () => {
    const row = (id: string, kind: string, url: string, key: string) => ({
      id, kind, url, key, lighting: null, prompt: null, panorama: true, parent_key: null, room_id: 'room-7',
      created_at: '2026-10-01T10:00:00Z',
    })
    listRenders.mockResolvedValue([row('1', 'upscale', 'https://s3/old4k.jpg', 'renders/u/old4k.jpg'), row('2', 'render', 'https://s3/old.jpg', 'renders/u/old.jpg')])
    await renderOnceWith('room-7')
    expect(listRenders).toHaveBeenCalledWith('room-7')
    const thumbs = await screen.findAllByRole('button', { name: /Saqlangan renderlar:/ })
    expect(thumbs).toHaveLength(2)

    fireEvent.click(thumbs[1])

    expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/old.jpg')
  })

  it('does nothing while closed', () => {
    render(<RenderSheet open={false} onOpenChange={() => {}} />)
    expect(panoramaJpeg).not.toHaveBeenCalled()
    expect(createRender).not.toHaveBeenCalled()
  })

  it('has no flat / 360 choice any more — it is always a panorama', async () => {
    await renderOnce()
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('shows the reason when the render is refused', async () => {
    panoramaJpeg.mockResolvedValue(new Blob(['pano']))
    createRender.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))
    render(<RenderSheet open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
  })

  it('says so when the panorama cannot be taken, and does not call the server', async () => {
    panoramaJpeg.mockResolvedValue(null)
    render(<RenderSheet open onOpenChange={() => {}} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Panoramani olib bo'))
    expect(createRender).not.toHaveBeenCalled()
  })

  it('renders again from the button once it has finished', async () => {
    await renderOnce()
    waitForRender.mockResolvedValueOnce({ url: 'https://s3/r2.jpg', key: 'renders/u/a2.jpg', prompt: null })
    fireEvent.click(screen.getByRole('button', { name: /Qayta/ }))
    await waitFor(() => expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/r2.jpg'))
    expect(createRender).toHaveBeenCalledTimes(2)
  })

  it('puts the generated prompt in the box, marked as automatic, when the user wrote none', async () => {
    await renderOnce({ ...FIRST, prompt: 'oak floor, white walls' })
    expect(screen.getByRole('textbox')).toHaveValue('oak floor, white walls')
    expect(screen.getByText(/Avtomatik tavsif/)).toBeInTheDocument()
  })

  it('offers lighting only once there is a render', async () => {
    panoramaJpeg.mockResolvedValue(new Blob(['x']))
    createRender.mockResolvedValue({ job_id: 'j1' })
    waitForRender.mockReturnValue(new Promise(() => {}))
    render(<RenderSheet open onOpenChange={() => {}} />)
    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: 'Iliq chiroqlar' })).toBeNull()
  })

  it('relights from the shown render, adds the result as a version and can step back', async () => {
    await renderOnce()
    createRelight.mockResolvedValue({ job_id: 'j2' })
    waitForRender.mockResolvedValueOnce({ url: 'https://s3/lit.jpg', key: 'renders/u/b.jpg', prompt: null })

    fireEvent.click(screen.getByRole('button', { name: 'Iliq chiroqlar' }))

    // a relit panorama is still a panorama
    await waitFor(() => expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/lit.jpg'))
    expect(createRelight).toHaveBeenCalledWith('renders/u/a.jpg', 'warm_lamps')
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    fireEvent.click(screen.getByRole('tab', { name: /Asl/ }))
    expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/r.jpg')
  })

  it('keeps the render and shows the reason when a relight fails', async () => {
    await renderOnce()
    createRelight.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))

    fireEvent.click(screen.getByRole('button', { name: 'Kunduzgi' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
    expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/r.jpg')
  })

  describe('4K', () => {
    it('offers a 4K copy once there is a render, recommended for a panorama, and adds it as a version', async () => {
      await renderOnce()
      expect(screen.getByText(/360° panorama uchun tavsiya/)).toBeInTheDocument()
      createUpscale.mockResolvedValue({ job_id: 'ju' })
      waitForRender.mockResolvedValueOnce({ url: 'https://s3/big.jpg', key: 'renders/u/big.jpg', prompt: null })

      fireEvent.click(screen.getByRole('button', { name: '4K ga oshirish' }))

      await waitFor(() => expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/big.jpg'))
      expect(createUpscale).toHaveBeenCalledWith('renders/u/a.jpg')
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Asl'), expect.stringContaining('4K')]))
      expect(screen.queryByText(/360° panorama uchun tavsiya/)).toBeNull()
    })

    it('does not offer 4K again on the 4K copy', async () => {
      await renderOnce()
      createUpscale.mockResolvedValue({ job_id: 'ju' })
      waitForRender.mockResolvedValueOnce({ url: 'https://s3/big.jpg', key: 'renders/u/big.jpg', prompt: null })
      fireEvent.click(screen.getByRole('button', { name: '4K ga oshirish' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '4K ✓' })).toBeDisabled())
      expect(createUpscale).toHaveBeenCalledTimes(1)
    })

    it('says why it failed, keeping the render', async () => {
      await renderOnce()
      createUpscale.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))
      fireEvent.click(screen.getByRole('button', { name: '4K ga oshirish' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
      expect(screen.getByTestId('pano-viewer')).toHaveAttribute('data-src', 'https://s3/r.jpg')
      expect(screen.getByRole('button', { name: '4K ga oshirish' })).toBeEnabled()
    })
  })
})
