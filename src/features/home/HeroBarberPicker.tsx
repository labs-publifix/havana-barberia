import { Link } from 'react-router-dom'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useStaff } from '@/app/queries'
import { routes } from '@/app/routes'
import { teamOrder } from '@/config/team'
import { cn } from '@/lib/cn'
import { staffFaces } from './media'

const card = cn(
  'group relative flex h-full w-[148px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-white/[0.12] bg-ink-950/55 backdrop-blur-md',
  'transition-[border-color,background-color,transform] duration-base ease-brand hover:-translate-y-0.5 hover:border-white/30 hover:bg-ink-950/70',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-400 motion-reduce:hover:translate-y-0',
  'sm:w-[164px]',
)

/**
 * "¿Con quién te sientas?" — one tap opens the booking flow with the barber
 * preselected (the flow already reads ?barbero=). The service is chosen in step 1.
 */
export function HeroBarberPicker() {
  const { data: staff } = useStaff()
  // One slot per barber from the start (skeleton until the data arrives), so the
  // carousel never shifts or re-snaps when the cards load.
  const barbers = teamOrder.map((id) => ({ id, s: staff?.find((x) => x.id === id) }))

  return (
    <div className="grid gap-3">
      <p id="hero-barbers" className="text-sm font-medium text-gray-200">
        ¿Con quién te sientas?
      </p>
      <ul
        aria-labelledby="hero-barbers"
        className="no-scrollbar -mx-4 flex snap-x scroll-px-4 items-stretch gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        {barbers.map(({ id, s: b }) => {
          const face = staffFaces[id]
          if (!b)
            return (
              <li key={id} className="flex" aria-hidden>
                <span className={cn(card, 'animate-pulse')}>
                  <span className="aspect-[4/3] w-full bg-white/[0.06]" />
                  <span className="h-[58px]" />
                </span>
              </li>
            )
          return (
            <li key={id} className="flex">
              <Link to={routes.bookWith({ staffId: b.id })} className={card}>
                {face && (
                  <img
                    src={face.src}
                    srcSet={face.srcSet}
                    sizes="164px"
                    alt=""
                    width={160}
                    height={160}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full object-cover object-[50%_35%]"
                  />
                )}
                <span className="flex flex-1 items-end justify-between gap-2 p-3">
                  <span className="grid">
                    <span className="text-[15px] font-semibold leading-tight text-white">{b.name}</span>
                    <span className="mt-0.5 text-xs text-gray-300">Barbero</span>
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-white"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          )
        })}
        <li className="flex">
          <Link to={routes.bookWith({ staffId: 'any' })} className={card}>
            <span className="grid aspect-[4/3] w-full place-items-center bg-white/[0.04]" aria-hidden>
              <Sparkles className="size-7 text-gray-200" strokeWidth={1.5} />
            </span>
            <span className="flex flex-1 items-end justify-between gap-2 p-3">
              <span className="grid">
                <span className="text-[15px] font-semibold leading-tight text-white">Primero disponible</span>
                <span className="mt-0.5 text-xs text-gray-300">Más horarios</span>
              </span>
              <ArrowUpRight
                className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-white"
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
          </Link>
        </li>
      </ul>
    </div>
  )
}
