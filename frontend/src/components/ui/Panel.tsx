import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A card for the platform pages (projects, shop, craftsmen, profile).
 *
 * It follows the day/night theme: a white card on the lavender ground by day, a dark indigo card on
 * a darker ground by night, with the text inside it switching to match. The studio and the
 * dialogs do not use it; they keep their own white surfaces.
 */
export const Panel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(function Panel({ className, interactive = false, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-3xl border border-line bg-card text-ink shadow-panel',
        interactive && 'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-light/50',
        className,
      )}
      {...props}
    />
  )
})

/** A small tile inside a Panel: a stat, a row, an icon bubble's background. */
export function Tile({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-card-soft', className)} {...props} />
}

/** The round coloured badge an icon sits in on a card. */
export function IconBubble({
  className, tone = 'blue', children,
}: { className?: string; tone?: 'blue' | 'orange' | 'green' | 'violet'; children: React.ReactNode }) {
  const tones = {
    blue: 'from-[#5B84F5] to-[#2F55D4] shadow-glow',
    orange: 'from-[#FB923C] to-[#EA580C] shadow-glow-orange',
    green: 'from-[#34D399] to-[#059669] shadow-[0_12px_28px_-10px_rgba(5,150,105,0.6)]',
    violet: 'from-[#A78BFA] to-[#6D28D9] shadow-[0_12px_28px_-10px_rgba(109,40,217,0.6)]',
  }
  return (
    <span
      aria-hidden="true"
      className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white', tones[tone], className)}
    >
      {children}
    </span>
  )
}
