import { describe, it, expect, vi, beforeEach } from 'vitest'

const client = vi.hoisted(() => ({ apiClient: vi.fn() }))
vi.mock('../client', () => client)

import { uploadMyModel } from '../seller'
import { uploadAdminFurniture } from '../admin'

const base = { file: new File(['x'], 'a.glb'), name_uz: 'Divan', category: 'divan' as const }
const sentForm = () => client.apiClient.mock.calls[0][1].body as FormData

beforeEach(() => client.apiClient.mockReset().mockResolvedValue({}))

describe.each([
  ['seller', uploadMyModel],
  ['admin', uploadAdminFurniture],
] as const)('%s upload', (_n, upload) => {
  it('sends the styles comma-separated', async () => {
    await upload({ ...base, styles: ['hitech', 'zamonaviy'] })
    expect(sentForm().get('styles')).toBe('hitech,zamonaviy')
  })
  it('omits styles when none are chosen', async () => {
    await upload({ ...base, styles: [] })
    expect(sentForm().has('styles')).toBe(false)
  })
})
