import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A round soft-UI control for a bare icon.
 *
 * Its own component rather than a `Button` with no label, because the two want
 * opposite things from their geometry. A labelled button is a pill sized by its
 * text; this is a circle sized by touch, and the icon has to sit dead centre
 * with no gap logic, no truncation and no trailing badge.
 *
 * `active` is the one place a moulded control is not enough. A pressed-in
 * shadow reads as "being touched right now", not "this is the one that is on",
 * so a control that is on becomes solid ink — which is exactly what the
 * reference does with its selected tab and its current page number.
 */

export type IconButtonVariant = 'soft' | 'ink' | 'ghost'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: with no text, this is the only name the control has. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Selected rather than merely hovered — renders as solid ink. */
  active?: boolean
  /** Squircle instead of a circle, for grids and paginators. */
  square?: boolean
  children: React.ReactNode
}

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-9 w-9',
  // 44px: the smallest square a finger reliably hits.
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
}

const REST: Record<IconButtonVariant, string> = {
  soft: 'bg-soft text-gray-700 shadow-soft-raised hover:shadow-soft-raised-lg active:shadow-soft-pressed',
  ink: 'bg-soft-ink text-white shadow-soft-ink active:scale-[0.94]',
  ghost: 'bg-transparent text-gray-500 hover:bg-soft hover:shadow-soft-raised-sm active:shadow-soft-pressed',
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, variant = 'soft', size = 'md', active = false, square = false, className, type = 'button', children, ...rest },
    ref,
  ) {
    const look = active ? REST.ink : REST[variant]

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        aria-pressed={active || undefined}
        className={cn(
          'inline-flex flex-none select-none items-center justify-center',
          square ? 'rounded-[30%]' : 'rounded-full',
          'transition-[box-shadow,transform,background-color] duration-200 ease-out',
          'focus-visible:outline-none focus-visible:shadow-soft-focus',
          'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-soft-raised-sm',
          'disabled:active:scale-100',
          SIZES[size],
          look,
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)
