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
export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl bg-white border border-neutral-200 shadow-lg',
            'max-h-[85vh] overflow-y-auto',
            'focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between px-5 pt-5">
            <div>
              <RadixDialog.Title className="text-base font-semibold text-neutral-900">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="text-sm text-neutral-500 mt-0.5">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <button
                aria-label="Yopish"
                className="text-neutral-400 hover:text-neutral-700 transition-colors rounded p-1 -mr-1 -mt-1"
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
