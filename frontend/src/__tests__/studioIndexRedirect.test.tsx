import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { StudioIndexRedirect } from '@/router'

function Where() {
  const { pathname, search } = useLocation()
  return <p>{pathname + search}</p>
}

describe('StudioIndexRedirect', () => {
  it('keeps the query string (?focus=1, ?ai_pin=) when opening the first tab', () => {
    const pin = encodeURIComponent('https://pin.it/AbCd12')
    const router = createMemoryRouter(
      [{ path: '/studio/:roomId', children: [
        { index: true, element: <StudioIndexRedirect /> },
        { path: 'ichkarida', element: <Where /> },
      ] }],
      { initialEntries: [`/studio/r1?app=1&focus=1&ai_pin=${pin}`] },
    )
    render(<RouterProvider router={router} />)
    expect(screen.getByText(`/studio/r1/ichkarida?app=1&focus=1&ai_pin=${pin}`)).toBeInTheDocument()
  })
})
