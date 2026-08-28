import * as React from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'default' | 'success' | 'warning' | 'error'

export interface ToastData {
  id: string
  variant?: ToastVariant
  title: string
  description?: string
}

// ─── Context (toast queue) ────────────────────────────────────────────────────

interface ToastContextValue {
  toast(data: Omit<ToastData, 'id'>): void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

// ─── Variant styles ───────────────────────────────────────────────────────────

const variantStyles: Record<ToastVariant, string> = {
  default:
    'bg-white border border-neutral-200 shadow-card',
  success:
    'bg-green-50 border border-green-200 shadow-card',
  warning:
    'bg-orange-50 border border-orange-200 shadow-card',
  error:
    'bg-red-50 border border-red-200 shadow-card',
}

const variantIconMap: Record<ToastVariant, string> = {
  default: '💬',
  success: '✓',
  warning: '⚠',
  error: '✕',
}

const variantIconColor: Record<ToastVariant, string> = {
  default: 'text-neutral-600',
  success: 'text-green-600',
  warning: 'text-orange-600',
  error: 'text-red-600',
}

const variantTitleColor: Record<ToastVariant, string> = {
  default: 'text-neutral-900',
  success: 'text-green-900',
  warning: 'text-orange-900',
  error: 'text-red-900',
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

interface ToastItemProps extends ToastData {
  onClose(id: string): void
}

/**
 * Single toast notification item.
 */
function ToastItem({ id, variant = 'default', title, description, onClose }: ToastItemProps) {
  return (
    <RadixToast.Root
      duration={3000}
      onOpenChange={(open) => {
        if (!open) onClose(id)
      }}
      className={cn(
        'relative flex items-start gap-3 p-4 rounded-lg',
        'data-[state=open]:animate-slide-in-from-right',
        'data-[state=closed]:animate-fade-out',
        variantStyles[variant],
      )}
      style={{ minWidth: 280, maxWidth: 380 }}
    >
      {/* Icon */}
      <span
        className={cn('flex-shrink-0 w-5 h-5 mt-0.5 text-sm font-bold flex items-center justify-center', variantIconColor[variant])}
        aria-hidden="true"
      >
        {variantIconMap[variant]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <RadixToast.Title
          className={cn('text-sm font-semibold leading-snug', variantTitleColor[variant])}
        >
          {title}
        </RadixToast.Title>
        {description && (
          <RadixToast.Description className={cn(
            'mt-1 text-xs leading-snug',
            variant === 'default'
              ? 'text-neutral-600'
              : 'text-neutral-700',
          )}>
            {description}
          </RadixToast.Description>
        )}
      </div>

      {/* Close button */}
      <RadixToast.Close
        className={cn(
          'flex-shrink-0 rounded p-1 transition-colors',
          'text-neutral-400 hover:text-neutral-600',
          'hover:bg-neutral-200',
        )}
        aria-label="Yopish"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M1 1l12 12M13 1L1 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </RadixToast.Close>
    </RadixToast.Root>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([])

  const toast = React.useCallback((data: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...data, id }])
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="right" duration={3000}>
        {children}

        {/* Stack viewport anchored bottom-right */}
        <RadixToast.Viewport
          className="fixed bottom-24 right-4 z-[100] flex flex-col gap-2 outline-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        />

        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onClose={removeToast} />
        ))}
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}
