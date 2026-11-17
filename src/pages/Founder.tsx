import { Link } from 'react-router-dom'
import { CalendarCheck, MapPin, Phone } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { useStaff } from '@/app/queries'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { business } from '@/config/business'
import { founder, isFounderStaff, storySrc, storySrcSet, type StoryImage } from '@/config/founder'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { MobileBookBar } from '@/features/site/MobileBookBar'
import { Reveal } from '@/features/site/Reveal'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { cn } from '@/lib/cn'

/** Public files (public/img) respect the app base (the demo lives under /demo/). */
const pub = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '')

function StoryFigure({
  img,
  sizes,
  className,
  imgClassName,
}: {
  img: StoryImage
  sizes: string
  className?: string
  imgClassName?: string
}) {
  const w1 = img.widths[img.widths.length - 1]!
  return (
    // Small originals are never stretched past their real width.
    <figure className={cn('grid gap-3', className)} style={w1 < 600 ? { maxWidth: w1 } : undefined}>
      <img
        src={pub(storySrc(img))}
        srcSet={storySrcSet(img)
          .split(', ')
          .map((p) => pub(p))
          .join(', ')}
        sizes={sizes}
        alt={img.alt}
        width={w1}
        height={Math.round(w1 * img.ratio)}
        loading="lazy"
        decoding="async"
        className={cn('h-auto w-full rounded-xl border border-white/10 bg-ink-900 object-cover', imgClassName)}
      />
      <figcaption className="text-[13px] text-gray-400">{img.caption}</figcaption>
    </figure>
  )
}

/**
 * /barberos/leonardo-gomez-rios — Leonardo Gómez Ríos, founder: who he is, his
 * story as a timeline (Cuba → La Habana → Querétaro) and how to book with him.
 * Content in src/config/founder.ts; search metadata and schema.org in
 * src/config/seo.ts and src/config/founderJsonLd.ts.
 */
export default function Founder() {
  useDocumentTitle(founder.name)
  const { data: staff } = useStaff()
  const me = staff?.find(isFounderStaff)
  const portrait = founder.portrait
  const book = routes.bookWith({ staffId: me?.id })

  return (
    <div data-theme="dark" className="min-h-dvh bg-ink-950 text-white">
      <SkipLink />
      <SiteNav startFloating />
      <main id="contenido" tabIndex={-1} className="outline-none">
        {/* ---------- Header: name, role, portrait ---------- */}
        <section
          id="perfil"
          aria-labelledby="perfil-title"
          className="relative overflow-hidden pb-16 pt-28 md:pb-24 md:pt-36"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
            <div className="grid min-w-0 content-end gap-6">
              <nav aria-label="Ruta de navegación">
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400">
                  <li>
                    <Link
                      to={routes.home}
                      className="rounded-sm underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                    >
                      Inicio
                    </Link>
                  </li>
                  <li aria-hidden>/</li>
                  <li>
                    <Link
                      to={{ pathname: routes.home, hash: '#barberos' }}
                      className="rounded-sm underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                    >
                      Barberos
                    </Link>
                  </li>
                  <li aria-hidden>/</li>
                  <li aria-current="page" className="text-gray-200">
                    {founder.name}
                  </li>
                </ol>
              </nav>
              <Eyebrow>Fundador de Havana Barbería</Eyebrow>
              <h1
                id="perfil-title"
                className="font-display text-[clamp(2.75rem,9vw,6rem)] font-semibold leading-[0.95] tracking-[-0.04em]"
              >
                <span className="block">Leonardo</span>
                <span className="block font-light italic tracking-[-0.03em] text-gray-200">Gómez Ríos</span>
              </h1>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-300">{founder.role}</p>
              <p className="max-w-[56ch] text-[17px] leading-relaxed text-gray-200 md:text-lg">{founder.lede}</p>
              <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
                <Link
                  to={book}
                  className={buttonClass({ variant: 'accent', size: 'lg', className: 'w-full sm:w-auto sm:px-8' })}
                >
                  <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden />
                  Reserva con Leonardo
                </Link>
                <Link
                  to={routes.services}
                  className="inline-flex min-h-tap items-center rounded-sm text-base font-semibold text-white underline decoration-white/40 underline-offset-[6px] transition-colors hover:decoration-aqua-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400"
                >
                  Ver servicios
                </Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
              <img
                src={pub(storySrc(portrait))}
                srcSet={storySrcSet(portrait)
                  .split(', ')
                  .map((p) => pub(p))
                  .join(', ')}
                sizes="(min-width: 1024px) 420px, (min-width: 640px) 384px, 92vw"
                alt={portrait.alt}
                width={960}
                height={1200}
                decoding="async"
                {...{ fetchpriority: 'high' }}
                className="aspect-[4/5] w-full rounded-2xl border border-white/10 bg-ink-900 object-cover"
              />
            </div>
          </div>

          {/* Quick facts */}
          <dl className="mx-auto mt-14 grid max-w-6xl grid-cols-2 gap-x-6 gap-y-6 px-4 md:mt-20 md:grid-cols-4 md:px-8">
            {founder.facts.map((f) => (
              <div key={f.label} className="grid content-start gap-1.5 border-t border-white/15 pt-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">{f.label}</dt>
                <dd className="text-lg font-semibold leading-snug tracking-[-0.01em] md:text-xl">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---------- Who he is ---------- */}
        <section aria-labelledby="quien-title" className="border-t border-white/10 py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div className="grid content-start gap-4">
              <Reveal>
                <Eyebrow index="01">Quién es</Eyebrow>
              </Reveal>
              <Reveal delay={80}>
                <DisplayHeading id="quien-title">
                  Barbero, estilista <Light>y formulador.</Light>
                </DisplayHeading>
              </Reveal>
              {/* Desktop: the photo fills the column under the heading. */}
              <Reveal delay={140} className="mt-6 hidden lg:block">
                <StoryFigure img={founder.craftPhoto} sizes="440px" className="max-w-[440px]" />
              </Reveal>
            </div>
            <Reveal delay={120} className="grid content-start gap-8">
              <p className="text-[17px] leading-relaxed text-gray-200 md:text-xl md:leading-relaxed">{founder.intro}</p>
              <StoryFigure
                img={founder.craftPhoto}
                sizes="(min-width: 640px) 440px, 92vw"
                className="max-w-[440px] lg:hidden"
              />
            </Reveal>
          </div>
        </section>

        {/* ---------- Timeline ---------- */}
        <section
          id="trayectoria"
          aria-labelledby="trayectoria-title"
          className="border-t border-white/10 py-20 md:py-28"
        >
          <div className="mx-auto grid max-w-6xl gap-4 px-4 md:px-8">
            <Reveal>
              <Eyebrow index="02">Trayectoria</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <DisplayHeading id="trayectoria-title">
                Del portal de su casa <Light>a Querétaro.</Light>
              </DisplayHeading>
            </Reveal>
          </div>

          <ol
            className={cn(
              'relative mx-auto mt-14 grid max-w-6xl gap-14 px-4 md:mt-20 md:gap-20 md:px-8',
              // The line: through the dots, from the first to the last.
              'before:absolute before:bottom-3 before:left-[calc(1rem+7px)] before:top-3 before:w-px before:bg-gradient-to-b before:from-aqua-400/70 before:via-white/20 before:to-white/10',
              'md:before:left-[calc(2rem+207px)]',
            )}
          >
            {founder.timeline.map((m, i) => (
              <Reveal
                as="li"
                key={m.title}
                className="relative grid gap-5 pl-10 md:grid-cols-[176px_minmax(0,1fr)] md:gap-16 md:pl-0"
              >
                {/* Dot on the line */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1.5 size-[15px] rounded-full border-2 border-aqua-400 bg-ink-950 ring-4 ring-ink-950 md:left-[200px]',
                    (i === 0 || i === founder.timeline.length - 1) && 'bg-aqua-400',
                  )}
                />
                <div className="grid content-start gap-1 md:sticky md:top-28 md:self-start md:text-right">
                  <p className="tabular text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] text-white">
                    {m.when}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aqua-400">{m.place}</p>
                </div>
                <div className="grid min-w-0 content-start gap-4">
                  <h3 className="text-[clamp(1.375rem,2.6vw,1.875rem)] font-semibold leading-tight tracking-[-0.02em]">
                    {m.title}
                  </h3>
                  {m.paragraphs.map((p) => (
                    <p
                      key={p.slice(0, 24)}
                      className="max-w-[64ch] text-base leading-relaxed text-gray-300 md:text-[17px]"
                    >
                      {p}
                    </p>
                  ))}
                  {m.image && (
                    <StoryFigure img={m.image} sizes="(min-width: 768px) 420px, 80vw" className="mt-2 max-w-[420px]" />
                  )}
                </div>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ---------- Craft + Cubita ---------- */}
        <section aria-labelledby="oficio-title" className="border-t border-white/10 py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-8 lg:grid-cols-2 lg:gap-16">
            <div className="grid content-start gap-6">
              <Reveal>
                <Eyebrow index="03">Su oficio</Eyebrow>
              </Reveal>
              <Reveal delay={80}>
                <DisplayHeading id="oficio-title">
                  Un servicio <Light>completo.</Light>
                </DisplayHeading>
              </Reveal>
              <Reveal delay={120}>
                <p className="max-w-[52ch] text-base leading-relaxed text-gray-300 md:text-[17px]">
                  Lo que consolidó en El Vedado sigue siendo su forma de trabajar en Havana Barbería: cada corte termina
                  con un acabado profesional.
                </p>
              </Reveal>
              <Reveal as="ol" delay={160} className="grid gap-3 sm:grid-cols-2">
                {founder.craft.map((c, i) => (
                  <li
                    key={c}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3.5"
                  >
                    <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-aqua-400 text-[13px] font-bold text-ink-950">
                      {i + 1}
                    </span>
                    <span className="font-medium">{c}</span>
                  </li>
                ))}
              </Reveal>
            </div>

            <Reveal delay={120} className="grid content-start">
              <div className="grid gap-4 rounded-2xl border border-white/10 bg-ink-900 p-6 md:p-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aqua-400">Su línea capilar</p>
                <h2 className="text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-none tracking-[-0.04em]">
                  {founder.brand.name}
                </h2>
                <p className="text-base leading-relaxed text-gray-300 md:text-[17px]">{founder.brand.description}</p>
                <p className="text-base leading-relaxed text-gray-300 md:text-[17px]">
                  Fundada y formulada por Leonardo, con activos de alta concentración y pensada para el uso diario en
                  barbería.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------- Visit / book ---------- */}
        <section aria-labelledby="visita-title" className="border-t border-white/10 py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
            <div className="grid gap-5">
              <Reveal>
                <Eyebrow index="04">Visítalo</Eyebrow>
              </Reveal>
              <Reveal delay={80}>
                <DisplayHeading id="visita-title">
                  Siéntate <Light>con Leonardo.</Light>
                </DisplayHeading>
              </Reveal>
              <Reveal delay={120}>
                <div className="flex flex-wrap items-center gap-x-7 gap-y-3 pt-2">
                  <Link
                    to={book}
                    className={buttonClass({ variant: 'accent', size: 'lg', className: 'w-full sm:w-auto sm:px-8' })}
                  >
                    <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden />
                    Reserva con Leonardo
                  </Link>
                  <a
                    href={business.directionsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-tap items-center rounded-sm text-base font-semibold text-white underline decoration-white/40 underline-offset-[6px] transition-colors hover:decoration-aqua-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400"
                  >
                    Cómo llegar
                  </a>
                </div>
              </Reveal>
            </div>
            <Reveal delay={160} as="address" className="grid gap-4 not-italic text-gray-300">
              <p className="flex gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-aqua-400" strokeWidth={1.75} aria-hidden />
                <span>
                  <span className="block font-semibold text-white">{business.name}</span>
                  {business.addressLines.map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
                </span>
              </p>
              <p className="flex items-center gap-3">
                <Phone className="size-5 shrink-0 text-aqua-400" strokeWidth={1.75} aria-hidden />
                <a
                  href={business.phoneHref}
                  className="tabular inline-flex min-h-tap items-center rounded-sm text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                >
                  {business.phoneDisplay}
                </a>
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
      <MobileBookBar watchId="perfil" />
    </div>
  )
}
