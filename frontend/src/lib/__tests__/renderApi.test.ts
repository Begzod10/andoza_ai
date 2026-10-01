import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiClient = vi.fn()
vi.mock('../api/client', () => ({ apiClient: (...a: unknown[]) => apiClient(...a) }))

import { createRender, createRelight, waitForRender, errorMessage, LIGHTING_MOODS } from '../api/render'

beforeEach(() => { apiClient.mockReset(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

describe('errorMessage', () => {
  it("unwraps the backend's {detail} body", () => {
    expect(errorMessage(new Error('{"detail":"Bugun AI so\'rovlar limiti tugadi."}'))).toBe("Bugun AI so'rovlar limiti tugadi.")
  })
  it('passes through anything that is not that shape', () => {
    expect(errorMessage(new Error('HTTP 500'))).toBe('HTTP 500')
    expect(errorMessage('plain')).toBe('plain')
  })
})

describe('createRender', () => {
  it('posts the image and a trimmed prompt as multipart', async () => {
    apiClient.mockResolvedValue({ job_id: 'j1' })
    await createRender(new Blob(['x'], { type: 'image/jpeg' }), '  warm oak ')
    const [path, opts] = apiClient.mock.calls[0]
    expect(path).toBe('/render')
    expect(opts.method).toBe('POST')
    expect((opts.body as FormData).get('prompt')).toBe('warm oak')
    expect((opts.body as FormData).get('file')).toBeInstanceOf(Blob)
  })

  it('omits the prompt when it is blank', async () => {
    apiClient.mockResolvedValue({ job_id: 'j1' })
    await createRender(new Blob(['x']), '   ')
    expect((apiClient.mock.calls[0][1].body as FormData).has('prompt')).toBe(false)
  })
})

describe('createRelight', () => {
  it('posts the render key and the mood as JSON', async () => {
    apiClient.mockResolvedValue({ job_id: 'j2' })
    await expect(createRelight('renders/u/a.jpg', 'warm_lamps')).resolves.toEqual({ job_id: 'j2' })
    const [path, opts] = apiClient.mock.calls[0]
    expect(path).toBe('/render/relight')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ render_key: 'renders/u/a.jpg', lighting: 'warm_lamps' })
  })

  it('offers the six interior moods the backend accepts', () => {
    expect([...LIGHTING_MOODS]).toEqual([
      'midday_light', 'golden_light', 'blue_hour_light', 'ambient_light', 'warm_lamps', 'dimmed_mood',
    ])
  })
})

describe('waitForRender', () => {
  it('hands back the generated prompt when there is one', async () => {
    apiClient.mockResolvedValue({
      job_id: 'j', status: 'SUCCESS',
      result: { status: 'ok', key: 'k', url: 'https://s3/r.jpg', prompt: 'oak floor, white walls' },
    })
    await expect(waitForRender('j')).resolves.toMatchObject({ prompt: 'oak floor, white walls' })
  })

  it('polls until the job succeeds and returns the image url', async () => {
    apiClient
      .mockResolvedValueOnce({ job_id: 'j', status: 'PENDING', result: null })
      .mockResolvedValueOnce({ job_id: 'j', status: 'SUCCESS', result: { status: 'ok', key: 'k', url: 'https://s3/r.jpg' } })
    const p = waitForRender('j')
    await vi.advanceTimersByTimeAsync(3000)
    await expect(p).resolves.toEqual({ url: 'https://s3/r.jpg', key: 'k', prompt: null })
    expect(apiClient).toHaveBeenCalledTimes(2)
  })

  it("surfaces the provider's failure message", async () => {
    apiClient.mockResolvedValue({ job_id: 'j', status: 'SUCCESS', result: { status: 'failed', error: 'Insufficient funds' } })
    await expect(waitForRender('j')).rejects.toThrow('Insufficient funds')
  })

  it('rejects a crashed job', async () => {
    apiClient.mockResolvedValue({ job_id: 'j', status: 'FAILURE', result: null })
    await expect(waitForRender('j')).rejects.toThrow()
  })

  it('stops when aborted', async () => {
    apiClient.mockResolvedValue({ job_id: 'j', status: 'PENDING', result: null })
    const c = new AbortController()
    const p = waitForRender('j', c.signal)
    const assertion = expect(p).rejects.toThrow('Aborted')
    await vi.advanceTimersByTimeAsync(10)
    c.abort()
    await assertion
  })
})
