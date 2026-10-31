import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

export function Avatar({
  name,
  src,
  size = 56,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn('shrink-0 rounded-full bg-gray-100 object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full bg-ink-950 font-semibold text-aqua-500', className)}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {initials(name)}
    </span>
  )
}

export function AnyBarberIcon({ size = 56 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-ink-950 text-aqua-500"
      style={{ width: size, height: size }}
    >
      <Sparkles className="size-6" strokeWidth={1.75} />
    </span>
  )
}
