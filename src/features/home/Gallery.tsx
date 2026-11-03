import { useState } from 'react'
import * as RD from '@radix-ui/react-dialog'
import { Camera, ChevronLeft, ChevronRight, X } from 'lucide-react'
import local1 from '@/assets/images/local-1.jpg'
import local2 from '@/assets/images/local-2.jpg'
import team1 from '@/assets/images/team-1.jpg'
import team2 from '@/assets/images/team-2.jpg'
import interior from '@/assets/images/hero.jpg'
import { buttonClass } from '@/components/ui/buttonClass'
import { business } from '@/config/business'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'
import { cn } from '@/lib/cn'
import { servicePhotos } from './media'

interface Photo {
  src: string
  srcSet?: string
  width: number
  height: number
  alt: string
  /** Bento cell span on desktop. */
  span: string
}

const photos: Photo[] = [
  { ...servicePhotos['corte-adulto']!, span: 'md:col-span-2 md:row-span-2' },
  {
    src: local1,
    width: 382,
    height: 510,
    alt: 'Sillones de barbero dorados bajo luces hexagonales',
    span: 'md:row-span-2',
  },
  { ...servicePhotos['afeitado-barba']!, span: '' },
  { src: team1, width: 340, height: 510, alt: 'Barbero haciendo un corte de cabello', span: 'md:row-span-2' },
  { ...servicePhotos['barba-premium']!, span: 'md:col-span-2' },
  { src: team2, width: 382, height: 510, alt: 'Barbero perfilando la barba de un cliente', span: 'md:row-span-2' },
  { ...servicePhotos['corte-barba']!, span: '' },
  { src: interior, width: 382, height: 510, alt: 'Interior de la barbería', span: '' },
  { src: local2, width: 287, height: 510, alt: 'Luces hexagonales en el techo de la barbería', span: '' },
]

/** Bento grid of service and shop photos with an accessible lightbox (Radix Dialog). */
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

      <ul className="mx-auto mt-12 grid max-w-6xl auto-rows-[160px] grid-cols-2 gap-3 px-4 md:auto-rows-[200px] md:grid-cols-4 md:gap-4 md:px-8">
        {photos.map((p, i) => (
          <Reveal
            as="li"
            key={p.src}
            delay={(i % 4) * 70}
            className={cn('relative', p.span, i === 0 && 'col-span-2 row-span-2')}
          >
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block h-full w-full overflow-hidden rounded-lg bg-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-400"
              aria-label={`Ampliar: ${p.alt}`}
            >
              <img
                src={p.src}
                srcSet={p.srcSet}
                sizes="(min-width: 768px) 25vw, 50vw"
                alt=""
                width={p.width}
                height={p.height}
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
                  src={current.srcSet ? current.srcSet.split(', ').at(-1)!.split(' ')[0] : current.src}
                  alt={current.alt}
                  width={current.width}
                  height={current.height}
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
