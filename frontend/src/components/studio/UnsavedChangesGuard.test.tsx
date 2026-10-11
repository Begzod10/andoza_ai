import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Outlet, Link } from 'react-router-dom'
import { UnsavedChangesGuard, leavesStudio } from './UnsavedChangesGuard'

function setup(initialDirty: boolean) {
  const state = { dirty: initialDirty }
  const isDirty = () => state.dirty
  function Studio() {
    return (
      <div>
        <Link to="/projects">back</Link>
        <Link to="/studio/r1/elektr">elektr-tab</Link>
        <Link to="/smeta/r1">smeta</Link>
        <UnsavedChangesGuard roomId="r1" isDirty={isDirty} />
        <Outlet />
      </div>
    )
  }
  const router = createMemoryRouter(
    [
      {
        path: '/studio/:roomId',
        element: <Studio />,
        children: [
          { path: 'ichkarida', element: <p>3d-tab</p> },
          { path: 'elektr', element: <p>elektr-page</p> },
        ],
      },
      { path: '/projects', element: <p>projects-page</p> },
      { path: '/smeta/:roomId', element: <p>smeta-page</p> },
    ],
    { initialEntries: ['/studio/r1/ichkarida'] },
  )
  render(<RouterProvider router={router} />)
  return { state, router }
}

describe('leavesStudio', () => {
  it('treats the studio and its tabs as staying, everything else as leaving', () => {
    expect(leavesStudio('r1', '/studio/r1')).toBe(false)
    expect(leavesStudio('r1', '/studio/r1/elektr')).toBe(false)
    expect(leavesStudio('r1', '/studio/r12/ichkarida')).toBe(true)
    expect(leavesStudio('r1', '/projects')).toBe(true)
    expect(leavesStudio('r1', '/smeta/r1')).toBe(true)
  })
})

describe('UnsavedChangesGuard', () => {
  it('lets a clean studio leave without asking', async () => {
    const { router } = setup(false)
    fireEvent.click(screen.getByText('back'))
    expect(await screen.findByText('projects-page')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects')
  })

  it('asks before leaving with unsaved changes; "Qolish" stays', async () => {
    const { router } = setup(true)
    fireEvent.click(screen.getByText('back'))
    expect(await screen.findByText("Saqlanmagan o'zgarishlar")).toBeTruthy()
    expect(router.state.location.pathname).toBe('/studio/r1/ichkarida')

    fireEvent.click(screen.getByText('Qolish'))
    await act(async () => {})
    expect(router.state.location.pathname).toBe('/studio/r1/ichkarida')
    expect(screen.queryByText("Saqlanmagan o'zgarishlar")).toBeNull()
  })

  it('"Saqlamasdan chiqish" proceeds with the navigation', async () => {
    const { router } = setup(true)
    fireEvent.click(screen.getByText('smeta'))
    fireEvent.click(await screen.findByText('Saqlamasdan chiqish'))
    expect(await screen.findByText('smeta-page')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/smeta/r1')
  })

  it('does not block switching between studio tabs', async () => {
    const { router } = setup(true)
    fireEvent.click(screen.getByText('elektr-tab'))
    expect(await screen.findByText('elektr-page')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/studio/r1/elektr')
    expect(screen.queryByText("Saqlanmagan o'zgarishlar")).toBeNull()
  })

  it('reads dirtiness at navigation time — no prompt right after a save', async () => {
    const { state, router } = setup(true)
    state.dirty = false // markSaved() without a re-render
    await act(async () => { await router.navigate('/projects') })
    expect(router.state.location.pathname).toBe('/projects')
  })

  it('prompts on tab close / reload only while dirty', () => {
    const { state } = setup(true)
    const dirtyEvt = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvt)
    expect(dirtyEvt.defaultPrevented).toBe(true)

    state.dirty = false
    const cleanEvt = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvt)
    expect(cleanEvt.defaultPrevented).toBe(false)
  })
})
