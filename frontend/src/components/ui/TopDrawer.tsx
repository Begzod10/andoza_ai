import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TopDrawerProps {
  open: boolean
  onOpenChange(open: boolean): void
  /** Screen title for accessibility. */
  title: string
  /** Distance from the viewport top the drawer opens below (e.g. a toolbar's height). */
  topOffset?: number
  children: React.ReactNode
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A menu panel that opens from the left edge of the screen, sliding downward
 * from a fixed top offset — the sibling of BottomSheet.tsx for chrome that
 * belongs at the TOP of the screen (a collapsed toolbar row's own menu)
 * rather than the bottom. Built on the same Radix Dialog + framer-motion
 * foundation as BottomSheet.tsx for a consistent overlay/focus-trap/escape
 * story across the app.
 */
export function TopDrawer({ open, onOpenChange, title, topOffset = 0, children }: TopDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            {/* Overlay */}
            <Dialog.Overlay asChild>
              <motion.div
                key="overlay"
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ top: topOffset }}
              />
            </Dialog.Overlay>

            {/* Panel */}
            <Dialog.Content asChild>
              <motion.div
                key="panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className={cn(
                  'fixed left-0 right-0 z-50',
                  'bg-white',
                  'rounded-b-2xl shadow-card',
                  'flex flex-col overflow-hidden',
                  'outline-none',
                )}
                style={{ top: topOffset, maxHeight: `calc(100dvh - ${topOffset}px)` }}
              >
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

/** Shared minimalist round icon-button trigger for a TopDrawer, used by the
 *  three collapsed studio header rows so they look/behave identically. */
export function TopDrawerButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={cn(
        'flex items-center justify-center shrink-0',
        'w-11 h-11 rounded-full transition-colors',
        active ? 'bg-brand text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200',
      )}
    >
      {children}
    </button>
  )
}
