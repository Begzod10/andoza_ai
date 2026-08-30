import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  helperText?: string
  error?: string
  selectSize?: 'sm' | 'md' | 'lg'
}

// ─── Styles ───────────────────────────────────────────────────────────────────
//
// Mirrors Input's classes exactly so a form mixing text inputs and selects
// looks like one consistent set of fields, not two different libraries.

const baseSelect =
  'w-full transition-all duration-150 ' +
  'border border-neutral-300 ' +
  'bg-white ' +
  'text-neutral-900 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ' +
  'disabled:bg-neutral-100 ' +
  'disabled:text-neutral-500 disabled:cursor-not-allowed'

const selectSizes: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 px-2.5 py-1.5 text-sm rounded',
  md: 'h-10 px-3 py-2 text-sm rounded-md',
  lg: 'h-12 px-4 py-3 text-base rounded-lg',
}

const baseLabel = 'block text-sm font-medium text-neutral-900 mb-1.5'
const baseHelperText = 'text-xs text-neutral-500 mt-1'
const baseErrorText = 'text-xs text-red-600 mt-1'

// ─── Component ────────────────────────────────────────────────────────────────

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ label, helperText, error, selectSize = 'md', className, children, ...rest }, ref) {
    return (
      <div className="w-full">
        {label && <label className={baseLabel}>{label}</label>}
        <select
          ref={ref}
          className={cn(
            baseSelect,
            selectSizes[selectSize],
            error && 'border-red-500 focus:ring-red-500 focus:ring-offset-0',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        {error ? (
          <p className={baseErrorText} role="alert">{error}</p>
        ) : helperText ? (
          <p className={baseHelperText}>{helperText}</p>
        ) : null}
      </div>
    )
  },
)

Select.displayName = 'Select'
