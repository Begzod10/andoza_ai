import * as React from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  /** Follow the app's day/night theme (the pages built on the themed cards) instead of the fixed white sheet. */
  themed?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Modal dialog built on Radix's Dialog primitive — handles focus trap,
 * Escape-to-close, and overlay click-outside for free.
 *
 * @example
 * ```tsx
 * <Dialog open={open} onOpenChange={setOpen} title="Do'kon qo'shish">
 *   <form>...</form>
 * </Dialog>
 * ```
 */
export function Dialog({ open, onOpenChange, title, description, children, className, themed = false }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
            themed ? 'rounded-3xl border border-line bg-card text-ink shadow-panel' : 'rounded-2xl bg-white border border-neutral-200 shadow-lg',
            'max-h-[85vh] overflow-y-auto',
            'focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <RadixDialog.Title className={cn('text-base font-semibold', themed ? 'font-extrabold text-ink' : 'text-neutral-900')}>
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className={cn('text-sm mt-0.5', themed ? 'text-ink-muted' : 'text-neutral-500')}>
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <button
                aria-label="Yopish"
                className={cn('transition-colors rounded p-1 -mr-1 -mt-1', themed ? 'text-ink-muted hover:text-ink' : 'text-neutral-400 hover:text-neutral-700')}
              >
                <X size={18} />
              </button>
            </RadixDialog.Close>
          </div>
          <div className="p-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
