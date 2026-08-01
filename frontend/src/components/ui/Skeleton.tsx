import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkeletonBaseProps {
  className?: string
}

interface TextSkeletonProps extends SkeletonBaseProps {
  variant: 'text'
  /**
   * Number of text lines. Each line is full width except the last,
   * which is narrowed to 60% to mimic natural prose endings.
   */
  lines?: number
}

interface CardSkeletonProps extends SkeletonBaseProps {
  variant: 'card'
  height?: number | string
}

interface CircleSkeletonProps extends SkeletonBaseProps {
  variant: 'circle'
  /** Diameter in px. Default 40. */
  size?: number
}

type SkeletonProps =
  | TextSkeletonProps
  | CardSkeletonProps
  | CircleSkeletonProps

// ─── Pulse base class ─────────────────────────────────────────────────────────

const pulseBase =
  'animate-pulse rounded bg-gradient-to-r from-neutral-200 to-neutral-100'

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Skeleton component for displaying placeholder content while loading.
 * Supports text, card, and circle variants.
 *
 * @example
 * ```tsx
 * <Skeleton variant="text" lines={3} />
 * <Skeleton variant="card" height={200} />
 * <Skeleton variant="circle" size={48} />
 * ```
 */
export function Skeleton(props: SkeletonProps) {
  const { className } = props

  if (props.variant === 'text') {
    const lines = props.lines ?? 3
    return (
      <div
        role="status"
        aria-label="Yuklanmoqda"
        className={cn('flex flex-col gap-2.5', className)}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(pulseBase, 'h-4 rounded')}
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
        <span className="sr-only">Yuklanmoqda...</span>
      </div>
    )
  }

  if (props.variant === 'card') {
    const height = props.height ?? 120
    return (
      <div
        role="status"
        aria-label="Yuklanmoqda"
        className={cn(pulseBase, 'rounded-lg w-full', className)}
        style={{
          height: typeof height === 'number' ? `${height}px` : height,
        }}
      >
        <span className="sr-only">Yuklanmoqda...</span>
      </div>
    )
  }

  // variant === 'circle'
  const size = props.variant === 'circle' ? (props.size ?? 40) : 40
  return (
    <div
      role="status"
      aria-label="Yuklanmoqda"
      className={cn(pulseBase, 'rounded-full flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <span className="sr-only">Yuklanmoqda...</span>
    </div>
  )
}

// ─── Convenience re-exports ───────────────────────────────────────────────────

export function SkeletonText(props: Omit<TextSkeletonProps, 'variant'>) {
  return <Skeleton variant="text" {...props} />
}

export function SkeletonCard(props: Omit<CardSkeletonProps, 'variant'>) {
  return <Skeleton variant="card" {...props} />
}

export function SkeletonCircle(props: Omit<CircleSkeletonProps, 'variant'>) {
  return <Skeleton variant="circle" {...props} />
}
