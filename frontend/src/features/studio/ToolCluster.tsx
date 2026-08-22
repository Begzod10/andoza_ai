import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The transform tools, collapsed to the one that is active.
 *
 * The toolbar has to carry a lot on a narrow screen, and four tool buttons is
 * the largest block in it — but three of the four are always the ones you are
 * not using. So only the active tool is shown, and the other three are held
 * behind a press-and-hold on it.
 *
 * A hold rather than a tap because the collapsed button is the *current* tool:
 * tapping it would otherwise mean "select the thing that is already selected",
 * which is a no-op that feels broken. Holding is a deliberate "show me the
 * others". A plain click still opens the cluster too, though — a control that
 * responds only to a 400 ms hold is undiscoverable, and there is nothing else
 * for a click on it to mean.
 *
 * The three inactive buttons stay mounted and collapse to zero width instead of
 * unmounting. Animating a mount means measuring it first, and a toolbar that
 * reflows while the user is reaching for it is worse than one that does not
 * animate at all.
 */

export interface ToolClusterItem<T extends string> {
  mode: T
  title: string
  icon: ReactNode
}

export interface ToolClusterProps<T extends string> {
  items: ToolClusterItem<T>[]
  value: T
  onChange(mode: T): void
  /** How long a press has to last to count as a hold, ms. */
  holdMs?: number
  className?: string
}

export function ToolCluster<T extends string>({
  items,
  value,
  onChange,
  holdMs = 400,
  className = '',
}: ToolClusterProps<T>) {
  const [open, setOpen] = useState(false)
  const holdTimer = useRef<number | null>(null)
  const heldOpen = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }, [])

  useEffect(() => clearHold, [clearHold])

  // Anywhere else, or Escape, puts it away. Without this the cluster stays
  // open behind whatever the user moved on to.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function startHold() {
    if (open) return
    heldOpen.current = false
    clearHold()
    holdTimer.current = window.setTimeout(() => {
      heldOpen.current = true
      setOpen(true)
    }, holdMs)
  }

  function endHold() {
    clearHold()
  }

  function handleActiveClick() {
    // The hold already opened it; the release that follows must not close it
    // again on the same gesture.
    if (heldOpen.current) {
      heldOpen.current = false
      return
    }
    setOpen((v) => !v)
  }

  function pick(mode: T) {
    onChange(mode)
    setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className={`flex items-center gap-1.5 ${className}`}
      role="group"
      aria-label="Tahrirlash asboblari"
    >
      {items.map((item, i) => {
        const isActive = item.mode === value
        const shown = open || isActive
        // Stagger outward from the active tool so the group unfolds from the
        // button the user is actually holding.
        const distance = Math.abs(i - items.findIndex((x) => x.mode === value))
        const delay = open ? distance * 45 : (items.length - distance) * 25

        return (
          <button
            key={item.mode}
            type="button"
            title={item.title}
            aria-pressed={isActive}
            aria-expanded={isActive ? open : undefined}
            aria-hidden={shown ? undefined : true}
            tabIndex={shown ? 0 : -1}
            onPointerDown={isActive ? startHold : undefined}
            onPointerUp={isActive ? endHold : undefined}
            onPointerLeave={isActive ? endHold : undefined}
            onPointerCancel={isActive ? endHold : undefined}
            onClick={() => (isActive ? handleActiveClick() : pick(item.mode))}
            style={{
              transitionDelay: `${delay}ms`,
              maxWidth: shown ? 180 : 0,
            }}
            className={[
              'flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full text-xs font-semibold',
              'transition-[max-width,opacity,transform,box-shadow,padding,background-color,color]',
              'duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:shadow-soft-focus',
              shown
                ? 'scale-100 px-2.5 py-1.5 opacity-100'
                : 'pointer-events-none scale-90 px-0 py-1.5 opacity-0',
              isActive
                ? 'bg-soft-ink text-white shadow-soft-ink'
                : 'bg-soft text-gray-600 shadow-soft-raised-sm hover:-translate-y-[1px] hover:text-gray-800 hover:shadow-soft-raised active:translate-y-0 active:shadow-soft-pressed',
            ].join(' ')}
          >
            <span className="flex flex-none items-center">{item.icon}</span>
            <span className="hidden whitespace-nowrap sm:inline">{item.title}</span>
          </button>
        )
      })}
    </div>
  )
}
