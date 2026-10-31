import { cn } from '@/lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-fg/[0.07]', className)} />
}

/** Screen-reader announcement paired with visual skeletons. */
export function LoadingRegion({ label = 'Cargando…', children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
