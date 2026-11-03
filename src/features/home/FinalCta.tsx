import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'

export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-title"
      className="relative overflow-hidden border-t border-white/10 bg-ink-950 py-24 md:py-36"
    >
      <div className="mx-auto grid max-w-4xl justify-items-center gap-8 px-4 text-center md:px-8">
        <Reveal>
          <h2
            id="cta-title"
            className="text-[clamp(2.25rem,6vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-white"
          >
            Tu próxima mejor versión <Light>empieza con una cita.</Light>
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <Link to={routes.book()} className={buttonClass({ variant: 'accent', size: 'lg', className: 'px-10' })}>
            <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden /> Reservar cita
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
