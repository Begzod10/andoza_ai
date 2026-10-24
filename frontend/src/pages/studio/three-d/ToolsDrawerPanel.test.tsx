import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolsDrawerPanel } from './ToolsDrawerPanel'

function renderPanel(onOpenSmeta?: () => void) {
  const slot = document.createElement('div')
  document.body.appendChild(slot)
  const closeMenu = vi.fn()
  render(
    <ToolsDrawerPanel
      menuSlot={slot}
      closeMenu={closeMenu}
      showQibla={false}
      setShowQibla={vi.fn()}
      sceneLightOn={false}
      sunHour={12}
      setSunHour={vi.fn()}
      setShowAiSheet={vi.fn()}
      setShowPanel={vi.fn()}
      activeRoomId="r1"
      onOpenRoom={vi.fn()}
      onOpenSmeta={onOpenSmeta}
    />,
  )
  return { closeMenu }
}

describe('the ⋮ menu smeta row', () => {
  it('opens the smeta and closes the menu (inside the native app)', () => {
    const open = vi.fn()
    const { closeMenu } = renderPanel(open)
    fireEvent.click(screen.getByRole('button', { name: 'Smeta' }))
    expect(closeMenu).toHaveBeenCalled()
    expect(open).toHaveBeenCalled()
  })

  it('is not there in a browser, where the header strip leads to it', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Smeta' })).toBeNull()
  })
})
