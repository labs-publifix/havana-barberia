import { useEffect, useRef, useState, type RefObject } from 'react'
import videoUrl from '@/assets/video/hero-loop.mp4'
import posterUrl from '@/assets/video/hero-poster.webp'
import poster640 from '@/assets/video/hero-poster-640.webp'
import posterBlur from '@/assets/video/hero-poster-blur.webp'
import { useMediaQuery, useReducedMotion, useSaveData } from '@/lib/hooks/useMediaQuery'

/**
 * Fixed full-screen layer behind the whole home page: hero video + dark mask.
 * As the page scrolls (CSS variable --hero-progress), the media blurs up to
 * 24px and a black veil grows, so reviews, treatments and barbers sit on a dark,
 * blurred texture. On phones the live blur is replaced by a pre-blurred poster.
 *
 * The poster is the LCP image; the video loads after it and only when motion is
 * allowed and the user is not saving data. It pauses once the solid sections
 * (`coverRef`) cover the screen.
 */
export function HeroBackdrop({ coverRef }: { coverRef: RefObject<Element | null> }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const reduced = useReducedMotion()
  const saveData = useSaveData()
  const isMobile = useMediaQuery('(max-width: 767px), (pointer: coarse)')
  const allowVideo = !reduced && !saveData
  const [src, setSrc] = useState<string | null>(null)
  const [covered, setCovered] = useState(false)

  // Defer the video until the page (and the poster) has loaded.
  useEffect(() => {
    if (!allowVideo) return
    const start = () => setSrc(videoUrl)
    if (document.readyState === 'complete') {
      const id = window.setTimeout(start, 300)
      return () => window.clearTimeout(id)
    }
    window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [allowVideo])

  // Covered by the solid sections (gallery onward): the backdrop is invisible, so pause.
  useEffect(() => {
    const el = coverRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return
        setCovered(e.boundingClientRect.top <= 0)
      },
      { threshold: [0, 1] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [coverRef])

  // On phones, stop the video once the hero is mostly scrolled away (the blurred poster shows).
  const [scrolledAway, setScrolledAway] = useState(false)
  useEffect(() => {
    if (!isMobile) return
    const onScroll = () => setScrolledAway(window.scrollY > window.innerHeight * 0.9)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isMobile])

  const shouldPlay = Boolean(src) && !covered && !(isMobile && scrolledAway)
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    if (shouldPlay) v.play().catch(() => undefined)
    else v.pause()
  }, [shouldPlay, src])

  return (
    <div aria-hidden className="hero-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-950">
      <div className="hero-backdrop__media absolute inset-0">
        <img
          src={posterUrl}
          srcSet={`${poster640} 640w, ${posterUrl} 1280w`}
          sizes="100vw"
          alt=""
          width={1280}
          height={720}
          {...{ fetchpriority: 'high' }}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
        />
        {src && (
          <video
            ref={videoRef}
            src={src}
            poster={posterUrl}
            muted
            loop
            playsInline
            autoPlay
            preload="auto"
            disablePictureInPicture
            className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
          />
        )}
      </div>
      {/* Phones: pre-blurred poster fades in instead of a live blur. */}
      {isMobile && (
        <img
          src={posterBlur}
          alt=""
          width={480}
          height={270}
          decoding="async"
          className="hero-backdrop__blurred absolute inset-0 h-full w-full scale-110 object-cover object-[70%_center]"
        />
      )}
      {/* Mask: base darkening, top gradient for the nav, bottom gradient into the next section. */}
      <div className="absolute inset-0 bg-[var(--hero-mask-base)]" />
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[var(--hero-mask-top)] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[85svh] bg-gradient-to-t from-[var(--hero-mask-bottom)] via-[var(--hero-mask-mid)] to-transparent md:h-[72svh]" />
      <div className="hero-backdrop__veil absolute inset-0 bg-ink-950" />
    </div>
  )
}
