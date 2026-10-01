import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const apiClient = vi.fn()
vi.mock('../api/client', () => ({ apiClient: (...a: unknown[]) => apiClient(...a) }))

import { createRender, waitForRender, errorMessage } from '../api/render'

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

describe('waitForRender', () => {
  it('polls until the job succeeds and returns the image url', async () => {
    apiClient
      .mockResolvedValueOnce({ job_id: 'j', status: 'PENDING', result: null })
      .mockResolvedValueOnce({ job_id: 'j', status: 'SUCCESS', result: { status: 'ok', key: 'k', url: 'https://s3/r.jpg' } })
    const p = waitForRender('j')
    await vi.advanceTimersByTimeAsync(3000)
    await expect(p).resolves.toBe('https://s3/r.jpg')
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
