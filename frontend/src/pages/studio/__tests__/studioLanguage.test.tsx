import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import type { Room } from '@/lib/api'
import { applyLanguage } from '@/i18n'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'
import PlacementPage from '../PlacementPage'
import { buildRadialItems } from '../three-d/radialMenuItems'

// The 3D scene and the tab strip need a GL context and a query client; the
// texts under test are the page's own.
vi.mock('../placement/ElektrScene', () => ({ ElektrThreeDView: () => null }))
vi.mock('@/components/studio/StudioTabStrip', () => ({ StudioTabStrip: () => null }))

const ROOM = { id: 'r1', apartment_id: 'a1', name: 'Zal', length: 4, width: 3, ceiling_height: 2.7 } as unknown as Room

function renderPage() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ room: ROOM }} />}>
          <Route index element={<PlacementPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => act(() => applyLanguage('uz')))

describe('studio pages follow the interface language', () => {
  it('shows the placement page in Uzbek by default', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Elektr qurilmalar' })).toBeInTheDocument()
    expect(screen.getByText('Avval elektr qutisini joylashtiring, keyin boshqa qurilmalarni')).toBeInTheDocument()
  })

  it('takes the placement page texts from ru.json and switches without a reload', () => {
    renderPage()
    act(() => applyLanguage('ru'))
    expect(screen.getByRole('button', { name: ru.studio.placement.tab_elektr })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: ru.studio.placement.tab_chiroq })).toBeInTheDocument()
    expect(screen.getByText(ru.studio.placement.elektr.avval_quti)).toBeInTheDocument()
    // the device names come from the locale too
    expect(screen.getByText(ru.studio.placement.dev.switch1)).toBeInTheDocument()
    expect(screen.queryByText('Bitta kalit')).not.toBeInTheDocument()

    act(() => applyLanguage('en'))
    expect(screen.getByRole('button', { name: en.studio.placement.tab_elektr })).toBeInTheDocument()
    expect(screen.getByText(en.studio.placement.dev.switch1)).toBeInTheDocument()
  })

  it('uses the Russian plural forms for the counter', () => {
    renderPage()
    act(() => applyLanguage('ru'))
    // no devices yet: "0 устройств"
    expect(screen.getByText('0 устройств')).toBeInTheDocument()
  })

  it('builds the radial menu labels in the current language', () => {
    const deps = { wallpapers: [], placeElectrical: () => {} } as never
    const wall = { surface: 'wall', wallId: 'A', x: 0, y: 0 } as never
    expect(buildRadialItems(wall, deps).slice(0, 2).map((i) => i.label)).toEqual(['Rang', 'Oboy'])
    act(() => applyLanguage('ru'))
    expect(buildRadialItems(wall, deps).slice(0, 2).map((i) => i.label))
      .toEqual([ru.studio.radial.rang, ru.studio.radial.oboy])
  })
})
