import { useState } from 'react'
import * as RD from '@radix-ui/react-dialog'
import { Camera, ChevronLeft, ChevronRight, X } from 'lucide-react'
import g1s from '@/assets/gallery/corte-01-480.webp'
import g1l from '@/assets/gallery/corte-01-960.webp'
import g2s from '@/assets/gallery/corte-02-480.webp'
import g2l from '@/assets/gallery/corte-02-960.webp'
import g3s from '@/assets/gallery/corte-03-480.webp'
import g3l from '@/assets/gallery/corte-03-960.webp'
import g4s from '@/assets/gallery/corte-04-480.webp'
import g4l from '@/assets/gallery/corte-04-960.webp'
import g5s from '@/assets/gallery/corte-05-480.webp'
import g5l from '@/assets/gallery/corte-05-960.webp'
import g6s from '@/assets/gallery/corte-06-480.webp'
import g6l from '@/assets/gallery/corte-06-960.webp'
import { buttonClass } from '@/components/ui/buttonClass'
import { business } from '@/config/business'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'
import { cn } from '@/lib/cn'

interface Photo {
  small: string
  large: string
  alt: string
}

const photos: Photo[] = [
  { small: g1s, large: g1l, alt: 'Corte clásico con raya marcada y barba perfilada' },
  { small: g2s, large: g2l, alt: 'Corte corto con degradado, vista de perfil' },
  { small: g3s, large: g3l, alt: 'Degradado alto con barba completa, de perfil' },
  { small: g4s, large: g4l, alt: 'Degradado medio con textura arriba' },
  { small: g5s, large: g5l, alt: 'Peinado hacia atrás con degradado bajo y raya' },
  { small: g6s, large: g6l, alt: 'Nuca con degradado limpio, vista trasera' },
]

/** Grid of real cuts (4:5) with an accessible lightbox (Radix Dialog). */
export function Gallery() {
  const [open, setOpen] = useState<number | null>(null)
  const current = open === null ? null : photos[open]
  const step = (d: number) => setOpen((i) => (i === null ? i : (i + d + photos.length) % photos.length))

  return (
    <section id="galeria" aria-labelledby="galeria-title" className="relative scroll-mt-24 bg-ink-950 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:px-8">
        <Reveal>
          <Eyebrow index="04">Galería</Eyebrow>
        </Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal delay={80}>
            <DisplayHeading id="galeria-title">
              El oficio, <Light>de cerca.</Light>
            </DisplayHeading>
          </Reveal>
          {business.instagramUrl && (
            <a
              href={business.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: 'secondary', className: 'border-white text-white hover:bg-white/10' })}
            >
              <Camera className="size-5" strokeWidth={1.75} aria-hidden /> Síguenos en Instagram
            </a>
          )}
        </div>
      </div>

      <ul
        className="mx-auto mt-12 grid max-w-6xl grid-cols-2 gap-3 px-4 md:grid-cols-3 md:gap-5 md:px-8"
        aria-label="Fotos de cortes"
      >
        {photos.map((p, i) => (
          <Reveal as="li" key={p.small} delay={(i % 3) * 80} className={cn(i % 3 === 1 && 'md:mt-12')}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block aspect-[4/5] w-full overflow-hidden rounded-lg bg-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-400"
              aria-label={`Ampliar: ${p.alt}`}
            >
              <img
                src={p.small}
                srcSet={`${p.small} 480w, ${p.large} 960w`}
                sizes="(min-width: 1152px) 360px, (min-width: 768px) 31vw, 46vw"
                alt=""
                width={480}
                height={600}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-slow ease-brand group-hover:scale-[1.04] motion-reduce:transition-none"
              />
            </button>
          </Reveal>
        ))}
      </ul>

      <RD.Root open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-overlay bg-ink-950/90 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
          <RD.Content
            className="fixed inset-0 z-modal grid place-items-center p-4 outline-none md:p-10"
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') step(1)
              if (e.key === 'ArrowLeft') step(-1)
            }}
          >
            <RD.Title className="sr-only">Galería</RD.Title>
            <RD.Description className="sr-only">{current?.alt}</RD.Description>
            {current && (
              <figure className="grid max-h-full justify-items-center gap-3">
                <img
                  src={current.large}
                  alt={current.alt}
                  width={960}
                  height={1200}
                  className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
                />
                <figcaption className="text-sm text-gray-300">{current.alt}</figcaption>
              </figure>
            )}
            <div className="fixed inset-x-0 bottom-6 flex justify-center gap-3">
              {[
                { d: -1, label: 'Foto anterior', Icon: ChevronLeft },
                { d: 1, label: 'Foto siguiente', Icon: ChevronRight },
              ].map(({ d, label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => step(d)}
                  aria-label={label}
                  className="grid size-12 place-items-center rounded-full border border-white/20 bg-ink-900 text-white hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                >
                  <Icon className="size-6" strokeWidth={1.75} />
                </button>
              ))}
            </div>
            <RD.Close
              aria-label="Cerrar"
              className="fixed right-4 top-4 grid size-12 place-items-center rounded-full border border-white/20 bg-ink-900 text-white hover:bg-ink-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
            >
              <X className="size-6" strokeWidth={1.75} />
            </RD.Close>
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </section>
  )
}
