import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { isEmbeddedApp, WebOnly } from '@/lib/embedded'

beforeEach(() => {
  sessionStorage.clear()
})

describe('isEmbeddedApp', () => {
  it('is true when the URL carries app=1', () => {
    expect(isEmbeddedApp('?focus=1&app=1')).toBe(true)
  })

  it('remembers it for the session once the param is gone (in-app navigation)', () => {
    isEmbeddedApp('?app=1')
    expect(isEmbeddedApp('')).toBe(true)
    expect(isEmbeddedApp('?focus=1')).toBe(true)
  })

  it('is false in a normal browser', () => {
    expect(isEmbeddedApp('')).toBe(false)
    expect(isEmbeddedApp('?focus=1')).toBe(false)
    expect(isEmbeddedApp('?app=0')).toBe(false)
  })
})

describe('WebOnly', () => {
  function renderAt(url: string) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <WebOnly><a href="/projects">Orqaga</a></WebOnly>
      </MemoryRouter>,
    )
  }

  it('renders its children in a normal browser', () => {
    renderAt('/studio/r1/ichkarida')
    expect(screen.getByText('Orqaga')).toBeTruthy()
  })

  it('hides its children inside the native app', () => {
    renderAt('/studio/r1/ichkarida?app=1')
    expect(screen.queryByText('Orqaga')).toBeNull()
  })
})
