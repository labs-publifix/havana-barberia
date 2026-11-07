import { Link } from 'react-router-dom'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStaff } from '@/app/queries'
import { routes } from '@/app/routes'
import { teamOrder, teamProfiles } from '@/config/team'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'
import { staffPortraits } from './media'

/**
 * Tall 4:5 cards with full-bleed portraits. Role and bio come from config/team.ts
 * (empty until the client provides them: the label reads "BARBERO" and no bio shows).
 * "Reservar con…" preselects the barber via the flow's existing `barbero` param.
 */
export function Barbers() {
  const { data: staff } = useStaff()
  const people = teamOrder
    .map((id) => ({ id, s: staff?.find((x) => x.id === id) }))
    // Deactivated in the admin: drop it once the team has loaded (skeletons only while loading).
    .filter((p) => !staff || p.s)
  return (
    <section id="barberos" aria-labelledby="barberos-title" className="relative scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:px-8">
        <Reveal>
          <Eyebrow index="03">El equipo</Eyebrow>
        </Reveal>
        <Reveal delay={80}>
          <DisplayHeading id="barberos-title">
            Elige con quién <Light>sentarte.</Light>
          </DisplayHeading>
        </Reveal>
        <Reveal delay={140}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-300">
            <span className="tabular">{people.length}</span> profesionales · <span className="tabular">1</span>{' '}
            sucursal
          </p>
        </Reveal>
      </div>

      <ul className="mx-auto mt-12 grid max-w-6xl gap-5 px-4 sm:grid-cols-2 md:gap-6 md:px-8" aria-label="Barberos">
        {people.map(({ id, s }, i) => {
          const photo = staffPortraits[id]
          const profile = teamProfiles[id]
          const role = profile?.role || 'Barbero'
          const firstName = s?.name.split(' ')[0] ?? ''
          return (
            <Reveal as="li" key={id} delay={i * 100}>
              {!s || !photo ? (
                <Skeleton className="aspect-[4/5] rounded-xl bg-white/[0.06]" />
              ) : (
                <article
                  tabIndex={-1}
                  className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-white/10 bg-ink-900"
                  aria-labelledby={`barber-${id}`}
                >
                  <img
                    src={photo.src}
                    srcSet={photo.srcSet}
                    sizes="(min-width: 1152px) 540px, (min-width: 640px) 46vw, 92vw"
                    alt={`Retrato de ${s.name}`}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: photo.position }}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-slow ease-brand group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 grid gap-3 p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-aqua-400">{role}</p>
                    <h3
                      id={`barber-${id}`}
                      className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-none tracking-[-0.03em] text-white"
                    >
                      {s.name}
                    </h3>
                    {profile?.bio && <p className="max-w-[40ch] text-sm text-gray-200">{profile.bio}</p>}
                    <div className="transition-[opacity,transform] duration-base ease-brand lg:translate-y-2 lg:opacity-0 lg:group-focus-within:translate-y-0 lg:group-focus-within:opacity-100 lg:group-hover:translate-y-0 lg:group-hover:opacity-100">
                      <Link
                        to={routes.bookWith({ staffId: id })}
                        className={buttonClass({ variant: 'accent', size: 'md' })}
                      >
                        Reservar con {firstName}
                      </Link>
                    </div>
                  </div>
                </article>
              )}
            </Reveal>
          )
        })}
      </ul>
    </section>
  )
}
