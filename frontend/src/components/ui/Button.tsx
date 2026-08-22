import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The soft-UI button.
 *
 * Neumorphism is made of light rather than fill: a raised control is the same
 * colour as the surface behind it and is shaped by two shadows, a white one
 * where the light falls and a blue-grey one where it does not. That is why the
 * default variant has no background of its own, and why pressing it does not
 * darken it — it moves the same two shadows inside, so the control reads as
 * physically pushed in.
 *
 * The states are the ones the reference lays out, in order: default, hover,
 * focus, pressed, loading, success. Loading and success are given their own
 * colours because they are outcomes rather than emphasis — a teal fill says
 * "working" from across the room, where a spinner alone on an unchanged button
 * often reads as nothing having happened.
 *
 * Filled variants break the neumorphic rule deliberately. An affirmative action
 * has to out-rank everything around it, and a moulded control cannot: it is by
 * construction the same colour as its surroundings. So `primary` and `accent`
 * sit *on* the surface and cast a shadow instead of catching one.
 */

export type ButtonVariant = 'soft' | 'primary' | 'accent' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /** Shows the settled, affirmative state. Outranks `loading`. */
  success?: boolean
  /** Stretches to the width of its container. */
  block?: boolean
  leftIcon?: React.ReactNode
  /** Rendered in a circular badge at the trailing edge, as in the reference. */
  rightIcon?: React.ReactNode
  children?: React.ReactNode
}

const SIZES: Record<ButtonSize, { shell: string; badge: string; icon: number }> = {
  sm: { shell: 'h-9 px-4 text-[13px] gap-1.5', badge: 'h-6 w-6', icon: 14 },
  md: { shell: 'h-11 px-5 text-[14px] gap-2', badge: 'h-7 w-7', icon: 16 },
  lg: { shell: 'h-14 px-7 text-[16px] gap-2.5', badge: 'h-9 w-9', icon: 18 },
}

/** Idle look per variant. */
const REST: Record<ButtonVariant, string> = {
  soft: 'bg-soft text-gray-800 shadow-soft-raised',
  primary: 'bg-soft-ink text-white shadow-soft-ink',
  accent:
    'bg-gradient-to-br from-[#6C87F2] to-[#3B63DE] text-white shadow-soft-accent',
  ghost: 'bg-transparent text-gray-600 shadow-none',
  danger: 'bg-gradient-to-br from-[#F2645A] to-[#D93A3A] text-white shadow-[0_10px_22px_-8px_rgba(217,58,58,.55)]',
}

/**
 * Hover lifts, press sinks.
 *
 * The moulded variants swap to an inset shadow on press; the filled ones have
 * no inset to swap to, so they take a small scale instead. Both are the same
 * gesture — the control gives under the finger.
 */
const HOVER: Record<ButtonVariant, string> = {
  soft: 'hover:shadow-soft-raised-lg hover:-translate-y-[1px]',
  primary: 'hover:-translate-y-[1px] hover:shadow-[0_14px_26px_-8px_rgba(23,26,35,.62)]',
  accent: 'hover:-translate-y-[1px] hover:shadow-[0_14px_28px_-8px_rgba(59,99,222,.62)]',
  ghost: 'hover:bg-soft hover:shadow-soft-raised-sm',
  danger: 'hover:-translate-y-[1px]',
}

const PRESS: Record<ButtonVariant, string> = {
  soft: 'active:shadow-soft-pressed active:translate-y-0 active:text-gray-700',
  primary: 'active:scale-[0.97] active:translate-y-0',
  accent: 'active:scale-[0.97] active:translate-y-0',
  ghost: 'active:shadow-soft-pressed',
  danger: 'active:scale-[0.97] active:translate-y-0',
}

/** Badge fill, so the trailing icon reads against whatever it sits on. */
const BADGE: Record<ButtonVariant, string> = {
  soft: 'bg-soft-raised text-gray-700 shadow-soft-raised-sm',
  primary: 'bg-white/15 text-white',
  accent: 'bg-white/22 text-white',
  ghost: 'bg-soft-raised text-gray-700 shadow-soft-raised-sm',
  danger: 'bg-white/22 text-white',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'soft',
    size = 'md',
    loading = false,
    success = false,
    block = false,
    leftIcon,
    rightIcon,
    className,
    disabled,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const dims = SIZES[size]
  // Success outranks loading: a request that has come back is no longer in
  // flight, and showing both would be a contradiction on screen.
  const state = success ? 'success' : loading ? 'loading' : 'idle'
  const isBusy = state === 'loading'
  const isDisabled = disabled || isBusy

  const stateClass =
    state === 'loading'
      ? 'bg-gradient-to-br from-[#2BB6A3] to-[#1E9E8C] text-white shadow-soft-teal'
      : state === 'success'
        ? 'bg-white text-gray-900 shadow-soft-raised-lg'
        : cn(REST[variant], !isDisabled && HOVER[variant], !isDisabled && PRESS[variant])

  const badgeClass = state === 'idle' ? BADGE[variant] : 'bg-white/22 text-current'
  const trailing = isBusy ? <Spinner size={dims.icon} /> : state === 'success' ? <Check size={dims.icon} /> : rightIcon

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isBusy || undefined}
      data-state={state}
      className={cn(
        'relative inline-flex select-none items-center justify-center rounded-full',
        'font-semibold leading-none',
        // Shadow and transform carry the interaction, so they are what
        // transitions; colour is left alone to avoid a laggy hover tint.
        'transition-[box-shadow,transform,background-color] duration-200 ease-out',
        'focus-visible:outline-none focus-visible:shadow-soft-focus',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-soft-raised-sm',
        'disabled:hover:translate-y-0 disabled:active:scale-100',
        dims.shell,
        stateClass,
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {leftIcon && !isBusy && <span className="flex flex-none items-center">{leftIcon}</span>}

      {children != null && <span className="truncate">{children}</span>}

      {trailing && (
        <span
          className={cn(
            'ml-0.5 flex flex-none items-center justify-center rounded-full',
            'transition-colors duration-200',
            dims.badge,
            badgeClass,
          )}
        >
          {trailing}
        </span>
      )}
    </button>
  )
})

function Spinner({ size }: { size: number }) {
  return (
    <svg
      className="animate-spin"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.28" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Check({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
