import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A row of options in one moulded well, with the chosen one in solid ink.
 *
 * The container is raised and the options inside it are flat, so the group
 * reads as a single physical object rather than as several buttons that happen
 * to be adjacent — which is the whole point of a segmented control, and what
 * tells the user only one of them can be on.
 *
 * There is no sliding indicator. The selected option is itself the ink block,
 * so nothing can drift out of sync with the selection, and the control behaves
 * correctly when options are added, removed or reordered at runtime.
 */

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  /** Rendered above the label when the control is in `stack` layout. */
  icon?: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange(value: T): void
  /** `stack` puts the icon over the label — for five-across on a phone. */
  layout?: 'inline' | 'stack'
  size?: 'sm' | 'md'
  /** Each option takes an equal share of the width. */
  block?: boolean
  className?: string
  'aria-label'?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layout = 'inline',
  size = 'md',
  block = false,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const pad = size === 'sm' ? 'p-1' : 'p-1.5'
  const item =
    layout === 'stack'
      ? 'flex-col gap-1 py-2 px-2 min-h-[52px]'
      : size === 'sm'
        ? 'h-8 px-3 gap-1.5'
        : 'h-10 px-4 gap-2'

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-stretch rounded-full bg-soft shadow-soft-raised',
        layout === 'stack' && 'rounded-[22px]',
        pad,
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex select-none items-center justify-center whitespace-nowrap',
              'text-[13px] font-semibold leading-none',
              'transition-[box-shadow,transform,background-color,color] duration-200 ease-out',
              'focus-visible:outline-none focus-visible:shadow-soft-focus',
              'disabled:cursor-not-allowed disabled:opacity-45',
              layout === 'stack' ? 'rounded-[16px]' : 'rounded-full',
              item,
              block && 'flex-1',
              selected
                ? 'bg-soft-ink text-white shadow-soft-ink'
                : 'bg-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {option.icon && <span className="flex flex-none items-center">{option.icon}</span>}
            <span className={cn(layout === 'stack' && 'text-[10px] tracking-tight')}>
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
