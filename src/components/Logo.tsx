import logoUrl from '@/assets/images/logo-640.webp'
import { cn } from '@/lib/cn'

/**
 * The only place the logo file is used.
 * TODO(logo-svg): replace the JPG-derived raster with the official SVG
 * (black-on-white and white-on-black) when the client delivers it.
 * On dark backgrounds the raster is color-inverted as a temporary measure;
 * it is never redrawn or vectorized here.
 */
export function Logo({ tone = 'onLight', className }: { tone?: 'onLight' | 'onDark'; className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Havana Barbería"
      width={640}
      height={407}
      decoding="async"
      className={cn('h-auto w-[132px] select-none', tone === 'onDark' && 'invert', className)}
    />
  )
}
