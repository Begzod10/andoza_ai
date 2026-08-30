import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Whether the card is interactive (shows hover effect).
   * @default false
   */
  interactive?: boolean
  /**
   * Card size variant.
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg'
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardBase =
  'rounded-2xl bg-white ' +
  'border border-neutral-200 ' +
  'shadow-sm transition-all duration-150'

const cardSizes: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-7',
}

const cardInteractive =
  'hover:shadow-md hover:border-neutral-300 cursor-pointer'

// ─── Header ────────────────────────────────────────────────────────────────────

/**
 * Card header component. Use as child of Card.
 *
 * @example
 * ```tsx
 * <Card>
 *   <Card.Header>Title</Card.Header>
 * </Card>
 * ```
 */
const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  function CardHeader({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('border-b border-neutral-200 pb-3 mb-3', className)}
        {...props}
      >
        {children}
      </div>
    )
  },
)
CardHeader.displayName = 'Card.Header'

// ─── Body ──────────────────────────────────────────────────────────────────────

/**
 * Card body component. Use as child of Card.
 *
 * @example
 * ```tsx
 * <Card>
 *   <Card.Body>Content</Card.Body>
 * </Card>
 * ```
 */
const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(
  function CardBody({ className, children, ...props }, ref) {
    return (
      <div ref={ref} className={cn('', className)} {...props}>
        {children}
      </div>
    )
  },
)
CardBody.displayName = 'Card.Body'

// ─── Footer ────────────────────────────────────────────────────────────────────

/**
 * Card footer component. Use as child of Card.
 *
 * @example
 * ```tsx
 * <Card>
 *   <Card.Footer>Actions</Card.Footer>
 * </Card>
 * ```
 */
const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  function CardFooter({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('border-t border-neutral-200 pt-3 mt-3', className)}
        {...props}
      >
        {children}
      </div>
    )
  },
)
CardFooter.displayName = 'Card.Footer'

// ─── Main Card Component ──────────────────────────────────────────────────────

/**
 * Card component with optional header, body, and footer sections.
 * Supports interactive mode for clickable cards.
 *
 * @example
 * ```tsx
 * <Card interactive>
 *   <Card.Header>
 *     <h2>Title</h2>
 *   </Card.Header>
 *   <Card.Body>
 *     <p>Content goes here</p>
 *   </Card.Body>
 *   <Card.Footer>
 *     <Button>Action</Button>
 *   </Card.Footer>
 * </Card>
 * ```
 */
const Card = React.forwardRef<
  HTMLDivElement,
  CardProps
>(function Card(
  { interactive = false, size = 'md', className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardBase, cardSizes[size], interactive && cardInteractive, className)}
      {...props}
    >
      {children}
    </div>
  )
}) as unknown as React.ForwardRefExoticComponent<CardProps & React.RefAttributes<HTMLDivElement>> & {
  Header: typeof CardHeader
  Body: typeof CardBody
  Footer: typeof CardFooter
}

Card.displayName = 'Card'
Card.Header = CardHeader
Card.Body = CardBody
Card.Footer = CardFooter

export { Card, CardHeader, CardBody, CardFooter }
