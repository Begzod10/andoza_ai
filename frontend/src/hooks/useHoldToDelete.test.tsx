/**
 * Press and hold, then actually delete.
 *
 * This component has now broken twice in the same place, both times because
 * the backdrop that dismisses it and the button that acts sit in one tree and
 * share a press. First the backdrop closed on pointerDOWN, which unmounted it
 * before the browser dispatched the click, so the dismissing tap fell through
 * to the canvas and opened a surface menu. Moving the close to pointerUP fixed
 * that and broke the opposite case: the release on the delete button bubbled
 * to the backdrop, closed the tree, and the click that does the deleting was
 * never dispatched at all. The button looked alive, pressed, and did nothing.
 *
 * So both paths are pinned here: a press that lands on the button must delete,
 * and a press that lands anywhere else must dismiss without deleting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { HoldDeleteButton, useHoldToDelete } from './useHoldToDelete'
import { HOLD_DELETE_MS } from '@/lib/holdToDelete'

/**
 * A pointer event jsdom will carry.
 *
 * jsdom implements no `PointerEvent` at all, and React dispatches its pointer
 * handlers off the event's TYPE, so a MouseEvent named 'pointerdown' reaches
 * `onPointerDown` exactly as the real thing would — which is all these tests
 * need, since what is under test is which handlers see the event, not the
 * event's own class.
 */
function pointer(type: string, init: { clientX?: number; clientY?: number; pointerId?: number } = {}) {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  })
  Object.defineProperty(e, 'pointerId', { value: init.pointerId ?? 1 })
  return e
}

/** Arms a hold the way a mesh does, then renders the button it puts up. */
function Harness({ onDelete }: { onDelete: () => void }) {
  const { bind } = useHoldToDelete()
  return (
    <>
      <button
        data-testid="thing"
        {...bind({ label: 'Shkaf 3', onDelete })}
      >
        a wardrobe
      </button>
      <HoldDeleteButton />
    </>
  )
}

/** Holds the thing still for long enough that the delete button appears. */
function holdIt() {
  const thing = screen.getByTestId('thing')
  act(() => {
    thing.dispatchEvent(pointer('pointerdown', { clientX: 200, clientY: 300, pointerId: 1 }))
  })
  act(() => { vi.advanceTimersByTime(HOLD_DELETE_MS) })
}

describe('HoldDeleteButton', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows nothing until something has been held', () => {
    render(<Harness onDelete={() => {}} />)
    expect(screen.queryByRole('button', { name: /chirish/i })).toBeNull()
  })

  it('names what is about to go', () => {
    render(<Harness onDelete={() => {}} />)
    holdIt()
    expect(screen.getByText('Shkaf 3')).toBeTruthy()
  })

  it('deletes when the delete button is pressed and released', () => {
    // The regression: a real press is pointerdown, pointerup, then click. The
    // release must not reach the backdrop, or the tree unmounts first and the
    // click never happens.
    const onDelete = vi.fn()
    render(<Harness onDelete={onDelete} />)
    holdIt()

    const del = screen.getByRole('button', { name: /chirish/i })
    act(() => {
      del.dispatchEvent(pointer('pointerdown'))
      del.dispatchEvent(pointer('pointerup'))
      del.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /chirish/i })).toBeNull()
  })

  it('dismisses without deleting when the press lands anywhere else', () => {
    const onDelete = vi.fn()
    const { container } = render(<Harness onDelete={onDelete} />)
    holdIt()

    const backdrop = container.querySelector('.fixed.inset-0')!
    act(() => {
      backdrop.dispatchEvent(pointer('pointerdown'))
      backdrop.dispatchEvent(pointer('pointerup'))
    })

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /chirish/i })).toBeNull()
  })

  it('keeps the dismissing press off whatever is behind it', () => {
    // The other half of the pair: the canvas sits under this backdrop, and a
    // dismissal that bubbles opens a surface ring in the button's place.
    const behind = vi.fn()
    const onDelete = vi.fn()
    const { container } = render(
      <div onPointerDown={behind} onPointerUp={behind} onClick={behind}>
        <Harness onDelete={onDelete} />
      </div>,
    )
    holdIt()
    behind.mockClear()

    const backdrop = container.querySelector('.fixed.inset-0')!
    act(() => {
      backdrop.dispatchEvent(pointer('pointerdown'))
      backdrop.dispatchEvent(pointer('pointerup'))
      backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })

    expect(behind).not.toHaveBeenCalled()
  })
})
