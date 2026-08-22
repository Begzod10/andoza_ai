import { cn } from '@/lib/utils'

/**
 * A soft switch.
 *
 * The track is moulded inward and the knob is raised out of it, so the two
 * shadows do the work the fill normally would — off is the surface with a
 * groove in it, on is the same groove with ink poured in.
 *
 * A real `role="switch"` rather than a styled checkbox: screen readers announce
 * it as on or off, and the keyboard behaviour comes for free.
 */

export interface ToggleProps {
  checked: boolean
  onChange(checked: boolean): void
  /** Required: the switch's own accessible name. */
  label: string
  /** Rendered beside the switch. Omit to place the label elsewhere. */
  showLabel?: boolean
  disabled?: boolean
  className?: string
}

export function Toggle({
  checked,
  onChange,
  label,
  showLabel = false,
  disabled = false,
  className,
}: ToggleProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={showLabel ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-8 w-14 flex-none items-center rounded-full px-1',
        'transition-[box-shadow,background-color] duration-250 ease-out',
        'focus-visible:outline-none focus-visible:shadow-soft-focus',
        'disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-soft-ink shadow-soft-ink' : 'bg-soft-deep shadow-soft-pressed',
        className,
      )}
    >
      <span
        className={cn(
          'h-6 w-6 rounded-full bg-soft-raised shadow-soft-raised-sm',
          'transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]',
          checked ? 'translate-x-6' : 'translate-x-0',
        )}
      />
    </button>
  )

  if (!showLabel) return control

  return (
    <label className="inline-flex items-center gap-3">
      {control}
      <span className="text-[14px] font-medium text-gray-700">{label}</span>
    </label>
  )
}
