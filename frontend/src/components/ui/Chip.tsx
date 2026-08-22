import * as React from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChipBaseProps {
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  className?: string
}

interface SelectableChipProps extends ChipBaseProps {
  mode?: 'selectable'
  selected?: boolean
  onChange?(selected: boolean): void
  onClose?: never
  onClick?: never
}

interface ClosableChipProps extends ChipBaseProps {
  mode: 'closable'
  onClose(): void
  selected?: never
  onChange?: never
  onClick?: never
}

interface StaticChipProps extends ChipBaseProps {
  mode?: 'static'
  onClick?(): void
  selected?: never
  onChange?: never
  onClose?: never
}

type ChipProps = SelectableChipProps | ClosableChipProps | StaticChipProps

// ─── Styles ───────────────────────────────────────────────────────────────────

// Moulded out of the surface when off, solid ink when on. A chip is a small
// target, so the selected state has to survive being glanced at rather than
// read — a tint would not, at this size.
const base =
  'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-semibold ' +
  'select-none cursor-pointer leading-none ' +
  'transition-[box-shadow,transform,background-color,color] duration-200 ease-out ' +
  'focus-visible:outline-none focus-visible:shadow-soft-focus'

const unselected = 'bg-soft text-gray-600 shadow-soft-raised-sm hover:text-gray-900 hover:shadow-soft-raised active:shadow-soft-pressed'

const selected = 'bg-soft-ink text-white shadow-soft-ink active:scale-[0.96]'

const disabledStyle = 'opacity-50 pointer-events-none shadow-soft-pressed'

// ─── Component ────────────────────────────────────────────────────────────────

export function Chip(props: ChipProps) {
  const { label, icon, disabled = false, className = '' } = props

  const isSelected =
    props.mode !== 'closable' && props.mode !== 'static'
      ? (props as SelectableChipProps).selected ?? false
      : false

  function handleClick() {
    if (disabled) return

    if (props.mode === 'selectable' || props.mode == null) {
      const p = props as SelectableChipProps
      p.onChange?.(!isSelected)
    } else if (props.mode === 'static') {
      const p = props as StaticChipProps
      p.onClick?.()
    }
  }

  function handleCloseClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (disabled) return
    if (props.mode === 'closable') {
      ;(props as ClosableChipProps).onClose()
    }
  }

  const colorClass = isSelected ? selected : unselected

  return (
    <span
      role={props.mode === 'selectable' || props.mode == null ? 'checkbox' : 'button'}
      aria-checked={props.mode === 'selectable' || props.mode == null ? isSelected : undefined}
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={[base, colorClass, disabled ? disabledStyle : '', className].join(' ')}
    >
      {icon && (
        <span className="flex-shrink-0 text-[1em] leading-none">{icon}</span>
      )}
      <span>{label}</span>
      {props.mode === 'closable' && (
        <button
          type="button"
          aria-label={`${label}ni o'chirish`}
          className={[
            'flex-shrink-0 ml-0.5 -mr-0.5 rounded-full p-0.5',
            isSelected
              ? 'hover:bg-white/25'
              : 'hover:bg-soft-deep',
            'transition-colors focus-visible:outline-none',
          ].join(' ')}
          onClick={handleCloseClick}
          tabIndex={-1}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1 1l8 8M9 1L1 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  )
}
