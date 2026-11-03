import { useRef } from 'react'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { useScrollProgress } from '@/lib/hooks/useScrollProgress'
import { HeroBackdrop } from '@/features/home/HeroBackdrop'
import { Hero } from '@/features/home/Hero'
import { HeroBarberPicker } from '@/features/home/HeroBarberPicker'
import { Reviews } from '@/features/home/Reviews'
import { Treatments } from '@/features/home/Treatments'
import { Barbers } from '@/features/home/Barbers'
import { Gallery } from '@/features/home/Gallery'
import { Location } from '@/features/home/Location'
import { FinalCta } from '@/features/home/FinalCta'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { MobileBookBar } from '@/features/site/MobileBookBar'
import { SkipLink } from '@/features/site/SkipLink'
import { LocalBusinessJsonLd } from '@/features/site/LocalBusinessJsonLd'
import { useHashScroll } from '@/features/site/useHashScroll'

/**
 * Public home. The hero video + mask is a fixed backdrop that blurs as you scroll;
 * reviews, treatments and barbers sit on it with transparent backgrounds; gallery,
 * location and the final CTA return to solid black (and pause the video).
 */
export default function Home() {
  useDocumentTitle(null)
  useScrollProgress()
  useHashScroll()
  const solidRef = useRef<HTMLDivElement>(null)
  return (
    <div data-theme="dark" className="relative isolate min-h-dvh bg-ink-950 text-white">
      <SkipLink />
      <LocalBusinessJsonLd />
      <HeroBackdrop coverRef={solidRef} />
      <SiteNav />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <Hero />
        {/* Phones and tablets: the barber picker sits just below the hero to keep the video clean. */}
        <section aria-label="Elige barbero" className="mx-auto max-w-6xl px-4 pt-10 md:px-8 lg:hidden">
          <HeroBarberPicker />
        </section>
        <Reviews />
        <Treatments />
        <Barbers />
        <div ref={solidRef} className="bg-ink-950">
          <Gallery />
          <Location />
          <FinalCta />
        </div>
      </main>
      <SiteFooter />
      <MobileBookBar />
    </div>
  )
}
