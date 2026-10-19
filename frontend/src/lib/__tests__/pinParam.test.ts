import { describe, it, expect } from 'vitest'
import { pinParam } from '@/lib/api/ai'

describe('pinParam', () => {
  it('reads the pin link the mobile app hands to the studio', () => {
    expect(pinParam('?app=1&ai_pin=' + encodeURIComponent('https://pin.it/AbCd12'))).toBe('https://pin.it/AbCd12')
  })

  it("finds the link inside Pinterest's whole share text", () => {
    const text = 'Check out this Pin! https://pin.it/AbCd12'
    expect(pinParam('?ai_pin=' + encodeURIComponent(text))).toBe('https://pin.it/AbCd12')
  })

  it('is null without the param or for a link that is not a pin', () => {
    expect(pinParam('?app=1')).toBeNull()
    expect(pinParam('?ai_pin=' + encodeURIComponent('https://evil.example/pin/1/'))).toBeNull()
  })
})
