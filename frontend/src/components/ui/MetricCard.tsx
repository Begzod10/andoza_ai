import * as React from 'react'
import { useMotionValue, animate, useTransform } from 'framer-motion'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: number
  unit?: string
  /** Number of decimal places to display. Default 1. */
  decimals?: number
  /** Icon rendered above the value. */
  icon?: React.ReactNode
  className?: string
}

// ─── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, decimals: number) {
  const motionValue = useMotionValue(0)
  const displayed = useTransform(motionValue, (v) => v.toFixed(decimals))

  React.useEffect(() => {
    const controls = animate(motionValue, target, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
    })
    return () => controls.stop()
  }, [target, motionValue])

  return displayed
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * MetricCard displays an animated number with label and unit.
 * Animates from 0 to target value when mounted or value changes.
 *
 * @example
 * ```tsx
 * <MetricCard
 *   label="Total Users"
 *   value={1234}
 *   unit="users"
 *   icon={<Users size={20} />}
 * />
 * ```
 */
export function MetricCard({
  label,
  value,
  unit,
  decimals = 1,
  icon,
  className,
}: MetricCardProps) {
  const displayed = useCountUp(value, decimals)

  return (
    <div
      className={cn(
        'rounded-lg bg-white',
        'border border-neutral-200',
        'shadow-card hover:shadow-lg transition-shadow',
        'px-4 py-4 flex flex-col gap-3',
        className,
      )}
    >
      {icon && (
        <span className="text-brand text-xl leading-none">
          {icon}
        </span>
      )}

      <div className="flex items-baseline gap-2">
        <motion.span
          className="text-3xl font-bold tracking-tight text-neutral-900"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {displayed}
        </motion.span>
        {unit && (
          <span className="text-sm font-medium text-neutral-600">
            {unit}
          </span>
        )}
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
    </div>
  )
}
