import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PhotoToModelField } from './PhotoToModelField'

const api = vi.hoisted(() => ({
  createPhotoModel: vi.fn(),
  fetchPhotoModelGlb: vi.fn(),
  waitForRender: vi.fn(),
}))
vi.mock('@/lib/api', () => api)

const img = (name: string) => new File(['x'], name, { type: 'image/jpeg' })
const pick = (label: string, file: File) =>
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } })

function setup() {
  const onBuilt = vi.fn()
  const onError = vi.fn()
  render(<PhotoToModelField onBuilt={onBuilt} onError={onError} />)
  return { onBuilt, onError }
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.createPhotoModel.mockResolvedValue({ job_id: 'j1' })
  api.waitForRender.mockResolvedValue({ url: 'u', key: 'photo-models/u/m.glb', prompt: null })
  api.fetchPhotoModelGlb.mockResolvedValue(new Blob(['glb']))
})

describe('PhotoToModelField', () => {
  it('defaults to one photo, which starts the build as soon as it is picked, with no other views', async () => {
    const { onBuilt } = setup()
    expect(screen.getByRole('radio', { name: '1 ta rasm' })).toHaveAttribute('aria-checked', 'true')

    pick('Rasmdan 3D model yaratish', img('sofa.jpg'))

    await waitFor(() => expect(onBuilt).toHaveBeenCalled())
    expect(api.createPhotoModel).toHaveBeenCalledWith(expect.any(File), {})
  })

  it('"several" shows a slot per angle instead, and builds only when told to', async () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Bir nechta rasm' }))

    expect(screen.queryByLabelText('Rasmdan 3D model yaratish')).toBeNull()
    for (const label of ['Old tomondan (majburiy)', 'Chap tomondan', 'Orqa tomondan', "O'ng tomondan"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    pick('Old tomondan (majburiy)', img('front.jpg'))
    expect(api.createPhotoModel).not.toHaveBeenCalled()
  })

  it('needs the front and at least one more view', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Bir nechta rasm' }))
    const go = () => screen.getByRole('button', { name: /rasmdan 3D model yaratish/ })
    expect(go()).toBeDisabled()

    pick('Old tomondan (majburiy)', img('front.jpg'))
    expect(go()).toBeDisabled() // one photo is the other mode

    pick('Chap tomondan', img('left.jpg'))
    expect(go()).toBeEnabled()
  })

  it('a side without the front is not enough', () => {
    setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Bir nechta rasm' }))
    pick('Chap tomondan', img('left.jpg'))
    pick('Orqa tomondan', img('back.jpg'))
    expect(screen.getByRole('button', { name: /rasmdan 3D model yaratish/ })).toBeDisabled()
  })

  it('sends the front as the photo and the other angles as views', async () => {
    const { onBuilt } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Bir nechta rasm' }))
    const front = img('chair-front.jpg'), left = img('l.jpg'), back = img('b.jpg')
    pick('Old tomondan (majburiy)', front)
    pick('Chap tomondan', left)
    pick('Orqa tomondan', back)

    fireEvent.click(screen.getByRole('button', { name: '3 ta rasmdan 3D model yaratish' }))

    await waitFor(() => expect(onBuilt).toHaveBeenCalled())
    expect(api.createPhotoModel).toHaveBeenCalledWith(front, { left, back })
    expect(onBuilt.mock.calls[0][0].baseName).toBe('chair-front') // named after the front
  })

  it('refuses any photo over 20 MB without calling the server', async () => {
    const { onError } = setup()
    fireEvent.click(screen.getByRole('radio', { name: 'Bir nechta rasm' }))
    const big = img('big.jpg')
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 })
    pick('Old tomondan (majburiy)', img('f.jpg'))
    pick("O'ng tomondan", big)
    fireEvent.click(screen.getByRole('button', { name: /rasmdan 3D model yaratish/ }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('20 MB')))
    expect(api.createPhotoModel).not.toHaveBeenCalled()
  })

  it('cannot switch mode while a model is being built', async () => {
    api.waitForRender.mockReturnValue(new Promise(() => {}))
    setup()
    pick('Rasmdan 3D model yaratish', img('sofa.jpg'))
    await screen.findByRole('status')
    expect(screen.getByRole('radio', { name: 'Bir nechta rasm' })).toBeDisabled()
  })
})
