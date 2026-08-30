import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /**
   * Label text shown above the input.
   */
  label?: string
  /**
   * Helper text shown below the input.
   */
  helperText?: string
  /**
   * Error message shown below the input. Shows in error state color.
   */
  error?: string
  /**
   * Icon element to show at the start of input.
   */
  startIcon?: React.ReactNode
  /**
   * Icon element to show at the end of input.
   */
  endIcon?: React.ReactNode
  /**
   * Size variant for the input.
   * @default 'md'
   */
  inputSize?: 'sm' | 'md' | 'lg'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const baseInput =
  'w-full transition-all duration-150 ' +
  'border border-neutral-300 ' +
  'bg-white ' +
  'text-neutral-900 ' +
  'placeholder:text-neutral-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ' +
  'disabled:bg-neutral-100 ' +
  'disabled:text-neutral-500 disabled:cursor-not-allowed'

const inputSizes: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 px-2.5 py-1.5 text-sm rounded',
  md: 'h-10 px-3 py-2 text-sm rounded-md',
  lg: 'h-12 px-4 py-3 text-base rounded-lg',
}

const baseLabel = 'block text-sm font-medium text-neutral-900 mb-1.5'

const baseHelperText = 'text-xs text-neutral-500 mt-1'

const baseErrorText = 'text-xs text-red-600 mt-1'

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Input component with optional label, helper text, and error state.
 *
 * @example
 * ```tsx
 * <Input
 *   label="Email"
 *   type="email"
 *   placeholder="you@example.com"
 *   helperText="We'll never share your email"
 *   inputSize="md"
 * />
 * ```
 *
 * @example
 * ```tsx
 * <Input
 *   label="Password"
 *   type="password"
 *   error="Password must be at least 8 characters"
 *   inputSize="md"
 * />
 * ```
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      helperText,
      error,
      startIcon,
      endIcon,
      inputSize = 'md',
      disabled,
      className,
      ...rest
    },
    ref,
  ) {
    const hasError = !!error
    const isDisabled = disabled

    return (
      <div className="w-full">
        {label && <label className={baseLabel}>{label}</label>}

        <div className="relative flex items-center">
          {startIcon && (
            <span className="absolute left-3 text-neutral-500 flex-shrink-0">
              {startIcon}
            </span>
          )}

          <input
            ref={ref}
            disabled={isDisabled}
            className={cn(
              baseInput,
              inputSizes[inputSize],
              hasError && 'border-red-500 focus:ring-red-500 focus:ring-offset-0',
              startIcon && 'pl-10',
              endIcon && 'pr-10',
              className,
            )}
            {...rest}
          />

          {endIcon && (
            <span className="absolute right-3 text-neutral-500 flex-shrink-0">
              {endIcon}
            </span>
          )}
        </div>

        {error ? (
          <p className={baseErrorText} role="alert">
            {error}
          </p>
        ) : helperText ? (
          <p className={baseHelperText}>{helperText}</p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
