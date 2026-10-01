import { describe, it, expect } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it("takes the sentence out of the API's {detail} body", () => {
    expect(errorMessage(new Error('{"detail":"Bugun AI so\'rovlar limiti tugadi. Ertaga qayta urinib ko\'ring."}'), 'x'))
      .toBe("Bugun AI so'rovlar limiti tugadi. Ertaga qayta urinib ko'ring.")
  })

  it('shows other messages as they came', () => {
    expect(errorMessage(new Error('Narx noto\'g\'ri'), 'x')).toBe("Narx noto'g'ri")
    expect(errorMessage(new Error('{"detail":[{"msg":"bad"}]}'), 'x')).toBe('{"detail":[{"msg":"bad"}]}')
  })

  it('falls back when there is nothing to show', () => {
    expect(errorMessage(new Error(''), 'Modelni yaratib bo\'lmadi')).toBe("Modelni yaratib bo'lmadi")
    expect(errorMessage('boom', 'fallback')).toBe('fallback')
  })

  it('never shows the proxy\'s HTML page', () => {
    expect(errorMessage(new Error('<html><title>502 Bad Gateway</title></html>'), 'x')).toMatch(/vaqtincha/)
  })
})
