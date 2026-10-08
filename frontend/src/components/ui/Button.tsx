import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Button variant type.
 * - primary: Brand gradient with a glow, for the main action
 * - accent: The logo's orange, for a call to action that should stand out
 * - soft: A tinted pill that follows the day/night theme, for the quieter actions beside a primary one
 * - secondary: Outlined brand color for secondary actions
 * - tertiary: Text-only for low-priority actions
 * - danger: Red background for destructive actions
 */
type ButtonVariant = 'primary' | 'accent' | 'soft' | 'secondary' | 'tertiary' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Icon to render before the label. */
  leftIcon?: React.ReactNode
  /** Icon to render after the label. */
  rightIcon?: React.ReactNode
  children: React.ReactNode
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const base =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-full ' +
  'transition-all duration-200 select-none focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-br from-[#5B84F5] to-[#2F55D4] text-white shadow-glow ' +
    'hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:brightness-95',
  accent:
    'bg-gradient-to-br from-[#FB923C] to-[#EA580C] text-white shadow-glow-orange ' +
    'hover:-translate-y-px hover:brightness-105 active:translate-y-0',
  soft:
    'bg-card-soft text-ink hover:bg-ink/10',
  secondary:
    'border-2 border-brand text-brand bg-transparent hover:bg-blue-50',
  tertiary:
    'text-brand bg-transparent hover:bg-blue-50 focus-visible:ring-1',
  danger:
    'bg-gradient-to-br from-red-500 to-red-700 text-white ' +
    'shadow-md shadow-red-600/25 hover:-translate-y-px hover:brightness-110',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2.5',
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

const spinnerSizes: Record<ButtonSize, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Button component with multiple variants and sizes.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="md" loading={false}>
 *   Click me
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      className,
      disabled,
      children,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...rest}
      >
        {loading ? (
          <Spinner className={spinnerSizes[size]} />
        ) : (
          leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!loading && rightIcon && (
          <span className="flex-shrink-0">{rightIcon}</span>
        )}
      </button>
    )
  },
)

Button.displayName = 'Button'
