/**
 * The wall menu's one job is to act when a button is tapped.
 *
 * It stopped doing that: the backdrop dismisses on pointerUP, and the buttons
 * only swallowed pointerDOWN — so a tap bubbled up, closed the menu, and the
 * click never landed. Every button looked dead, including the one that opens
 * the device list. A tap is pointerdown → pointerup → click, so a test that
 * only fires `click` would have sailed past it; these fire the whole sequence.
 */
import * as React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import SurfaceRadialMenu, { RadialIcons, type RadialItem } from './SurfaceRadialMenu'

/**
 * jsdom has no PointerEvent, so a MouseEvent carrying the pointer fields does
 * the job — React dispatches on the event's type name, which is what matters.
 */
function pointer(type: string, buttons: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons })
  Object.assign(e, { pointerId: 1, pointerType: 'touch', isPrimary: true })
  return e
}

/**
 * What a finger actually sends, in order. Wrapped in `act` so React has
 * flushed the state it set before the assertions look at the DOM.
 */
function tap(el: Element) {
  act(() => {
    el.dispatchEvent(pointer('pointerdown', 1))
    el.dispatchEvent(pointer('pointerup', 0))
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

const DEVICES = [
  'Elektr qutisi', 'Bitta kalit', 'Ikkita kalit',
  'Bitta rozetka', 'Ikkita rozetka', 'TV + Ethernet + Ant.', 'Konditsioner',
]

function buildItems(onPaint: () => void, onDevice: (l: string) => void): RadialItem[] {
  return [
    { key: 'paint', label: 'Rang', icon: RadialIcons.paint, onSelect: onPaint },
    { key: 'window', label: 'Oyna', icon: RadialIcons.window, onSelect: () => {} },
    { key: 'door', label: 'Eshik', icon: RadialIcons.door, onSelect: () => {} },
    {
      key: 'elektr', label: 'Elektr', icon: RadialIcons.socket, childLabel: 'Elektr',
      onSelect: () => {},
      children: DEVICES.map((l, i) => ({
        key: `d${i}`, label: l, icon: RadialIcons.socket, onSelect: () => onDevice(l),
      })),
    },
  ]
}

function mount() {
  const onPaint = vi.fn()
  const onDevice = vi.fn()
  const onClose = vi.fn()
  render(
    <SurfaceRadialMenu
      x={240} y={470} surface="wall"
      items={buildItems(onPaint, onDevice)}
      onClose={onClose}
    />,
  )
  return { onPaint, onDevice, onClose }
}

describe('tapping a wall-menu button', () => {
  it('runs the item and closes, rather than only closing', () => {
    const { onPaint, onClose } = mount()
    tap(screen.getByText('Rang').closest('button')!)
    expect(onPaint).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens the device list without dismissing the menu', () => {
    const { onClose } = mount()
    tap(screen.getByText('Elektr').closest('button')!)
    expect(onClose).not.toHaveBeenCalled()
    // The submenu is showing: a device the top level never had.
    expect(screen.getByText('Ikkita kalit')).toBeTruthy()
  })

  it('places a device picked from the list', () => {
    const { onDevice, onClose } = mount()
    tap(screen.getByText('Elektr').closest('button')!)
    tap(screen.getByText('Ikkita kalit').closest('button')!)
    expect(onDevice).toHaveBeenCalledWith('Ikkita kalit')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows three devices square on and a faded one either side', () => {
    mount()
    tap(screen.getByText('Elektr').closest('button')!)
    const buttons = [...document.querySelectorAll('button')]
      .filter((b) => DEVICES.includes(b.textContent!.trim()))
      .map((b) => Number(b.style.opacity || 1))
    expect(buttons.filter((o) => o > 0.9)).toHaveLength(3)
    expect(buttons.filter((o) => o > 0.05 && o <= 0.9)).toHaveLength(2)
    // The rest are past the window's ends and must not be visible at all —
    // showing them at the edge fade put seven buttons where five belong.
    expect(buttons.filter((o) => o <= 0.05).length).toBeGreaterThan(0)
  })

  it('still dismisses when the backdrop itself is tapped', () => {
    const { onClose, onPaint } = mount()
    const backdrop = document.querySelector('div.fixed.inset-0')!
    tap(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onPaint).not.toHaveBeenCalled()
  })
})
