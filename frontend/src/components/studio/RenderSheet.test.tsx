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
/** The 4K copy the sheet makes of the first render by itself. */
const BIG = { url: 'https://s3/big.jpg', key: 'renders/u/big.jpg', prompt: null }

const viewerSrc = () => screen.getByTestId('pano-viewer').getAttribute('data-src')

/**
 * Opening the sheet is what starts the render: the 360 camera's button opens
 * it. The 4K copy follows on its own and replaces the first render in the
 * viewer, so "ready" means the 4K is showing.
 */
async function renderOnce(outcome = FIRST, roomId?: string) {
  panoramaJpeg.mockResolvedValue(new Blob(['pano']))
  createRender.mockResolvedValue({ job_id: 'j1' })
  createUpscale.mockResolvedValue({ job_id: 'ju' })
  waitForRender.mockResolvedValueOnce(outcome).mockResolvedValueOnce(BIG)
  render(<RenderSheet open onOpenChange={() => {}} roomId={roomId} />)
  await waitFor(() => expect(viewerSrc()).toBe(BIG.url))
}

beforeEach(() => { createRender.mockReset(); createRelight.mockReset(); createUpscale.mockReset(); waitForRender.mockReset(); panoramaJpeg.mockReset(); listRenders.mockReset(); listRenders.mockResolvedValue([]) })

describe('RenderSheet', () => {
  it('takes the panorama and renders it as soon as it opens, with no button pressed', async () => {
    await renderOnce()
    expect(panoramaJpeg).toHaveBeenCalledTimes(1)
    expect(createRender).toHaveBeenCalledTimes(1)
    expect(createRender.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(waitForRender).toHaveBeenCalledWith('j1', expect.any(AbortSignal))
  })

  it('sends the room id so the picture is saved against it', async () => {
    await renderOnce(FIRST, 'room-7')
    expect(createRender).toHaveBeenCalledWith(expect.any(Blob), '', 'room-7')
  })

  it('lists the saved renders of the room and shows one when tapped', async () => {
    const row = (id: string, kind: string, url: string, key: string) => ({
      id, kind, url, key, lighting: null, prompt: null, panorama: true, parent_key: null, room_id: 'room-7',
      created_at: '2026-10-01T10:00:00Z',
    })
    listRenders.mockResolvedValue([row('1', 'upscale', 'https://s3/old4k.jpg', 'renders/u/old4k.jpg'), row('2', 'render', 'https://s3/old.jpg', 'renders/u/old.jpg')])
    await renderOnce(FIRST, 'room-7')
    expect(listRenders).toHaveBeenCalledWith('room-7')
    const thumbs = await screen.findAllByRole('button', { name: /Saqlangan renderlar:/ })
    expect(thumbs).toHaveLength(2)

    fireEvent.click(thumbs[1])

    expect(viewerSrc()).toBe('https://s3/old.jpg')
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
    waitForRender
      .mockResolvedValueOnce({ url: 'https://s3/r2.jpg', key: 'renders/u/a2.jpg', prompt: null })
      .mockResolvedValueOnce({ url: 'https://s3/big2.jpg', key: 'renders/u/big2.jpg', prompt: null })
    fireEvent.click(screen.getByRole('button', { name: /Qayta/ }))
    await waitFor(() => expect(viewerSrc()).toBe('https://s3/big2.jpg'))
    expect(createRender).toHaveBeenCalledTimes(2)
  })

  describe('the description', () => {
    it('is folded away until asked for, so the panorama gets the room', async () => {
      await renderOnce()
      expect(screen.queryByRole('textbox')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Tavsifni tahrirlash/ }))
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    it('holds the generated prompt, marked as automatic, when the user wrote none', async () => {
      await renderOnce({ ...FIRST, prompt: 'oak floor, white walls' })
      fireEvent.click(screen.getByRole('button', { name: /Tavsifni tahrirlash/ }))
      expect(screen.getByRole('textbox')).toHaveValue('oak floor, white walls')
      expect(screen.getByText(/Avtomatik tavsif/)).toBeInTheDocument()
    })
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
    await waitFor(() => expect(viewerSrc()).toBe('https://s3/lit.jpg'))
    // it is relit from the picture on show — the 4K copy
    expect(createRelight).toHaveBeenCalledWith(BIG.key, 'warm_lamps')
    expect(screen.getAllByRole('tab')).toHaveLength(3)

    fireEvent.click(screen.getByRole('tab', { name: /Asl/ }))
    expect(viewerSrc()).toBe('https://s3/r.jpg')
  })

  it('keeps the render and shows the reason when a relight fails', async () => {
    await renderOnce()
    createRelight.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))

    fireEvent.click(screen.getByRole('button', { name: 'Kunduzgi' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
    expect(viewerSrc()).toBe(BIG.url)
  })

  describe('4K', () => {
    it('is made on its own right after the first render and takes its place in the viewer', async () => {
      await renderOnce()
      expect(createUpscale).toHaveBeenCalledTimes(1)
      expect(createUpscale).toHaveBeenCalledWith(FIRST.key)
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Asl'), expect.stringContaining('4K')]))
    })

    it('is not offered again on the 4K copy', async () => {
      await renderOnce()
      expect(screen.getByRole('button', { name: '4K ✓' })).toBeDisabled()
      expect(createUpscale).toHaveBeenCalledTimes(1)
    })

    it('says why it failed, keeping the first render in the viewer', async () => {
      panoramaJpeg.mockResolvedValue(new Blob(['pano']))
      createRender.mockResolvedValue({ job_id: 'j1' })
      createUpscale.mockRejectedValue(new Error("Bugun AI so'rovlar limiti tugadi."))
      waitForRender.mockResolvedValueOnce(FIRST)
      render(<RenderSheet open onOpenChange={() => {}} />)
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('limiti tugadi'))
      expect(viewerSrc()).toBe(FIRST.url)
      // and the chip is there to try again by hand
      expect(screen.getByRole('button', { name: '4K ga oshirish' })).toBeEnabled()
    })

    it('can be made by hand for a relit picture, which is not 4K', async () => {
      await renderOnce()
      createRelight.mockResolvedValue({ job_id: 'j2' })
      waitForRender.mockResolvedValueOnce({ url: 'https://s3/lit.jpg', key: 'renders/u/b.jpg', prompt: null })
      fireEvent.click(screen.getByRole('button', { name: 'Iliq chiroqlar' }))
      await waitFor(() => expect(viewerSrc()).toBe('https://s3/lit.jpg'))

      waitForRender.mockResolvedValueOnce({ url: 'https://s3/lit4k.jpg', key: 'renders/u/b4k.jpg', prompt: null })
      fireEvent.click(screen.getByRole('button', { name: '4K ga oshirish' }))

      await waitFor(() => expect(viewerSrc()).toBe('https://s3/lit4k.jpg'))
      expect(createUpscale).toHaveBeenLastCalledWith('renders/u/b.jpg')
      expect(screen.getByRole('button', { name: '4K ✓' })).toBeDisabled()
    })
  })
})
