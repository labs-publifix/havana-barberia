import { Link } from 'react-router-dom'
import { ChevronRight, Scissors } from 'lucide-react'
import { useStaff } from '@/app/queries'
import { routes } from '@/app/routes'
import { cn } from '@/lib/cn'
import { barberPhoto, initials } from './media'

const row = cn(
  'group flex h-14 w-auto shrink-0 snap-start items-center gap-3 rounded-full border border-white/[0.12] bg-ink-950/50 pl-1.5 pr-4 backdrop-blur-md',
  'transition-[border-color,background-color] duration-base ease-brand hover:border-white/30 hover:bg-ink-950/70',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-400',
  'lg:w-[248px]',
)

function RowText({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <span className="grid flex-none whitespace-nowrap leading-tight lg:min-w-0 lg:flex-1 lg:whitespace-normal">
        <span className="truncate text-sm font-semibold text-white">{title}</span>
        <span className="truncate text-xs text-gray-300">{subtitle}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-gray-400 transition-[color,transform] duration-base group-hover:translate-x-0.5 group-hover:text-white motion-reduce:group-hover:translate-x-0"
        strokeWidth={1.75}
        aria-hidden
      />
    </>
  )
}

/**
 * "¿Con quién te sientas?" — compact pills; one tap opens the booking flow with the
 * barber preselected (the flow already reads ?barbero=). The service is chosen in step 1.
 * Desktop: a narrow column; phones: a horizontal row that scrolls.
 */
export function HeroBarberPicker() {
  const { data: staff } = useStaff()
  // The active barbers from the panel (Equipo); two placeholders while loading.
  const barbers = staff
    ? staff.map((s) => ({ id: s.id, s }))
    : [
        { id: 'loading-1', s: undefined },
        { id: 'loading-2', s: undefined },
      ]

  return (
    <div className="grid gap-2.5">
      <p id="hero-barbers" className="text-[13px] font-medium text-gray-300">
        ¿Con quién te sientas?
      </p>
      <ul
        aria-labelledby="hero-barbers"
        className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {barbers.map(({ id, s: b }) => {
          const photo = b ? barberPhoto(b, 'card') : null
          if (!b)
            return (
              <li key={id} aria-hidden className="shrink-0">
                <span className={cn(row, 'animate-pulse')}>
                  <span className="size-11 shrink-0 rounded-full bg-white/[0.08]" />
                </span>
              </li>
            )
          return (
            <li key={id} className="shrink-0">
              <Link to={routes.bookWith({ staffId: id })} className={row}>
                {photo ? (
                  <img
                    src={photo.src}
                    srcSet={photo.srcSet}
                    sizes="44px"
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    decoding="async"
                    className="size-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.07] text-sm font-semibold text-gray-200"
                  >
                    {initials(b.name)}
                  </span>
                )}
                <RowText title={b.name} subtitle={b.title || 'Barbero'} />
              </Link>
            </li>
          )
        })}
        <li className="shrink-0">
          <Link to={routes.bookWith({ staffId: 'any' })} className={row}>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.07]" aria-hidden>
              <Scissors className="size-5 text-gray-200" strokeWidth={1.6} />
            </span>
            <RowText title="Primero disponible" subtitle="Más horarios" />
          </Link>
        </li>
      </ul>
    </div>
  )
}
