import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'lg' | 'md' | 'sm'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:bg-ink-600',
  accent: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-aqua-600',
  secondary: 'border-[1.5px] border-fg bg-transparent text-fg hover:bg-fg/5 active:bg-fg/10',
  ghost: 'bg-transparent text-fg hover:bg-fg/5 active:bg-fg/10',
  danger: 'bg-danger text-danger-fg hover:bg-danger-hover active:bg-red-700',
}

const sizes: Record<ButtonSize, string> = {
  lg: 'h-btn-lg px-7 text-base',
  md: 'h-btn-md px-5 text-base',
  // 36px visual height; the ::before extends the hit area to 44px.
  sm: 'h-btn-sm px-4 text-sm before:absolute before:-inset-y-1 before:inset-x-0 before:content-[""]',
}

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  return cn(
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold leading-tight',
    'transition-colors duration-fast ease-brand',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    'disabled:pointer-events-none disabled:bg-disabled disabled:text-disabled-fg disabled:border-transparent',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  )
}
