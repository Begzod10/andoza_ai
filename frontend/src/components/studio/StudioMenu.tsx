import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface StudioMenuProps {
  open: boolean
  onOpenChange(open: boolean): void
  children: ReactNode
}

/**
 * The studio header's ⋮ button and its dropdown. The dropdown sits on the themed card so it follows
 * night mode, and closes like any popup: Escape (focus goes back to the button) or a click outside.
 * The forwarded ref is the button, which the share popover returns focus to.
 */
export const StudioMenu = forwardRef<HTMLButtonElement | null, StudioMenuProps>(function StudioMenu(
  { open, onOpenChange, children },
  ref,
) {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useImperativeHandle(ref, () => buttonRef.current!, [])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onOpenChange(false)
      buttonRef.current?.focus()
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      // The button toggles on its own click; closing here too would reopen it straight away.
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onOpenChange])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={t('studio.menu.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="w-10 h-10 rounded-full bg-card-soft text-ink-muted flex items-center justify-center hover:bg-line transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="4" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="9" cy="14" r="1.5"/>
        </svg>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute right-0 top-12 bg-card text-ink rounded-2xl shadow-panel border border-line z-50 w-64 max-w-[85vw] overflow-hidden"
        >
          {children}
        </div>
      )}
    </>
  )
})
