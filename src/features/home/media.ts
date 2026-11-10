// Image imports for the public site, keyed by catalog / staff ids.
import corteAdulto640 from '@/assets/services/corte-adulto-640.webp'
import corteAdulto1024 from '@/assets/services/corte-adulto-1024.webp'
import corteBarba640 from '@/assets/services/corte-barba-640.webp'
import corteBarba1024 from '@/assets/services/corte-barba-1024.webp'
import afeitado640 from '@/assets/services/afeitado-barba-640.webp'
import afeitado1024 from '@/assets/services/afeitado-barba-1024.webp'
import premium640 from '@/assets/services/barba-premium-640.webp'
import premium1024 from '@/assets/services/barba-premium-1024.webp'
import isaacCard120 from '@/assets/team/isaac-fuentes-card-120.webp'
import isaacCard240 from '@/assets/team/isaac-fuentes-card-240.webp'
import leoCard120 from '@/assets/team/leonardo-gomez-card-120.webp'
import leoCard240 from '@/assets/team/leonardo-gomez-card-240.webp'
import isaacPortrait400 from '@/assets/team/isaac-fuentes-portrait-400.webp'
import isaacPortrait800 from '@/assets/team/isaac-fuentes-portrait-800.webp'
import leoPortrait400 from '@/assets/team/leonardo-gomez-portrait-400.webp'
import leoPortrait800 from '@/assets/team/leonardo-gomez-portrait-800.webp'

export interface Responsive {
  src: string
  srcSet: string
  width: number
  height: number
}

const r = (small: string, sw: number, large: string, lw: number, ratio: number): Responsive => ({
  src: small,
  srcSet: `${small} ${sw}w, ${large} ${lw}w`,
  width: lw,
  height: Math.round(lw * ratio),
})

export const servicePhotos: Record<string, Responsive & { alt: string }> = {
  'corte-adulto': {
    ...r(corteAdulto640, 640, corteAdulto1024, 1024, 0.75),
    alt: 'Barbero perfilando un fade con máquina',
  },
  'corte-barba': {
    ...r(corteBarba640, 640, corteBarba1024, 1024, 0.75),
    alt: 'Corte con fade y barba recién arreglada',
  },
  'afeitado-barba': { ...r(afeitado640, 640, afeitado1024, 1024, 0.75), alt: 'Afeitado con navaja y espuma' },
  'barba-premium': { ...r(premium640, 640, premium1024, 1024, 0.75), alt: 'Cliente con toalla caliente en la barba' },
}

/** Head-and-shoulders squares for the hero barber picker. */
export const staffCards: Record<string, { src: string; srcSet: string }> = {
  isaac: { src: isaacCard120, srcSet: `${isaacCard120} 120w, ${isaacCard240} 240w` },
  leonardo: { src: leoCard120, srcSet: `${leoCard120} 120w, ${leoCard240} 240w` },
}

export const staffPortraits: Record<string, Responsive & { position: string }> = {
  isaac: { ...r(isaacPortrait400, 400, isaacPortrait800, 800, 1.25), position: '50% 20%' },
  leonardo: { ...r(leoPortrait400, 400, leoPortrait800, 768, 1.25), position: '50% 18%' },
}

/**
 * A barber's photo for the site. The photo uploaded in the panel wins; barbers
 * with a professional shoot bundled here use it while no other photo is set.
 * null: no photo yet (the card shows initials).
 */
export function barberPhoto(
  s: { id: string; photoUrl: string | null },
  kind: 'card' | 'portrait',
): { src: string; srcSet?: string; width?: number; height?: number; position?: string } | null {
  const bundled = kind === 'card' ? staffCards[s.id] : staffPortraits[s.id]
  const isBundled = !s.photoUrl || s.photoUrl === staffCards[s.id]?.src
  if (bundled && isBundled) return bundled
  return s.photoUrl ? { src: s.photoUrl, position: '50% 25%' } : null
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
