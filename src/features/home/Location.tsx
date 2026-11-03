import { Navigation, Phone } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { useNow } from '@/app/useNow'
import { business } from '@/config/business'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'
import { useOpenStatus } from '@/features/site/useOpenStatus'
import { cn } from '@/lib/cn'
import { formatTime12, localDate, weekdayOf } from '@/lib/time'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Address, hours with today highlighted, open status and direct actions. No embedded map. */
export function Location() {
  const now = useNow()
  const status = useOpenStatus()
  const today = weekdayOf(localDate(now, business.hours.timeZone))
  return (
    <section
      id="ubicacion"
      aria-labelledby="ubicacion-title"
      className="relative scroll-mt-24 bg-ink-950 py-24 md:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1fr_1.1fr] md:items-start md:px-8">
        <div className="grid gap-4">
          <Reveal>
            <Eyebrow index="05">Ubicación</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <DisplayHeading id="ubicacion-title">
              Te esperamos en <Light>Las Plazas.</Light>
            </DisplayHeading>
          </Reveal>
          <Reveal delay={140}>
            <address className="t-body-lg not-italic text-gray-200">
              {business.addressLines[0]}
              <br />
              {business.addressLines[1]}
            </address>
          </Reveal>
          <Reveal delay={200} className="mt-2 flex flex-wrap gap-3">
            <a
              href={business.directionsHref}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: 'accent', size: 'lg' })}
            >
              <Navigation className="size-5" strokeWidth={1.75} aria-hidden /> Cómo llegar
            </a>
            <a
              href={business.phoneHref}
              className={buttonClass({
                variant: 'secondary',
                size: 'lg',
                className: 'border-white text-white hover:bg-white/10',
              })}
            >
              <Phone className="size-5" strokeWidth={1.75} aria-hidden /> Llamar
            </a>
          </Reveal>
        </div>

        <Reveal delay={120} className="rounded-xl border border-white/10 bg-ink-900 p-6 md:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Horario</h3>
            <span
              className={cn(
                'inline-flex h-[24px] items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold',
                status.open ? 'bg-aqua-500 text-ink-950' : 'bg-white/10 text-gray-200',
              )}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden />
              <span className="tabular">{status.open ? 'Abierto ahora' : status.short}</span>
            </span>
          </div>
          <table className="w-full text-left">
            <caption className="sr-only">Horario de atención por día</caption>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
                const r = business.hours.weekly[wd] ?? []
                const isToday = wd === today
                return (
                  <tr
                    key={wd}
                    className={cn('border-b border-white/10 last:border-0', isToday && 'text-white')}
                    aria-current={isToday ? 'date' : undefined}
                  >
                    <th scope="row" className={cn('py-3 font-normal', isToday ? 'font-semibold' : 'text-gray-300')}>
                      {DAYS[wd]}
                      {isToday && (
                        <span className="ml-2 text-xs font-semibold uppercase tracking-[0.16em] text-aqua-400">
                          Hoy
                        </span>
                      )}
                    </th>
                    <td className={cn('tabular py-3 text-right', isToday ? 'font-semibold' : 'text-gray-300')}>
                      {r.length
                        ? r.map((x) => `${formatTime12(x.start)} – ${formatTime12(x.end)}`).join(', ')
                        : 'Cerrado'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Reveal>
      </div>
    </section>
  )
}
