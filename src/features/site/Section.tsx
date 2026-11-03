import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Small uppercase label with wide tracking; optional section number ("02"). */
export function Eyebrow({ children, index, className }: { children: ReactNode; index?: string; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-aqua-400',
        className,
      )}
    >
      {index && (
        <span className="tabular text-gray-400" aria-hidden>
          {index}
        </span>
      )}
      {index && <span className="h-px w-8 bg-white/25" aria-hidden />}
      {children}
    </p>
  )
}

/** Editorial heading: large, fluid, tight tracking. Use <Light> inside for the lighter words. */
export function DisplayHeading({
  as: Tag = 'h2',
  id,
  children,
  className,
}: {
  as?: 'h1' | 'h2'
  id?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Tag
      id={id}
      className={cn(
        'font-display text-[clamp(2.25rem,5.5vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-white',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/** Light italic words inside a display heading, for editorial rhythm. */
export const Light = ({ children }: { children: ReactNode }) => (
  <span className="font-light italic tracking-[-0.02em] text-gray-300">{children}</span>
)

export function SectionShell({
  id,
  labelledBy,
  className,
  children,
}: {
  id: string
  labelledBy: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn('relative scroll-mt-24 py-24 md:py-32', className)}>
      <div className="mx-auto w-full max-w-6xl px-4 md:px-8">{children}</div>
    </section>
  )
}
