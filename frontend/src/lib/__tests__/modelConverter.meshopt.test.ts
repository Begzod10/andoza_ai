import { describe, it, expect } from 'vitest'
import { makeGltfLoader } from '../modelConverter'

// The server stores a meshopt-compressed copy of every model; a file compressed
// that way (or one a user brings already compressed) only opens with the decoder.
describe('makeGltfLoader', () => {
  it('can read meshopt-compressed GLBs', () => {
    const loader = makeGltfLoader() as unknown as { meshoptDecoder: unknown }
    expect(loader.meshoptDecoder).toBeTruthy()
  })
})
