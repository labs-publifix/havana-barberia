import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useCatalog, useStaff } from '@/app/queries'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { teamOrder } from '@/config/team'
import { useOpenStatus } from '@/features/site/useOpenStatus'
import { cn } from '@/lib/cn'
import { durationLabel, money } from '@/lib/time'
import { staffFaces } from './media'

const optionBase =
  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-fast has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-aqua-400'

/**
 * Desktop-only quick booking: barber + one service, then straight to the date step.
 * Uses the query params the booking flow already understands (paso, servicios, barbero).
 */
export function QuickBookPanel() {
  const navigate = useNavigate()
  const status = useOpenStatus()
  const { data: catalog } = useCatalog()
  const { data: staff } = useStaff()
  const [staffId, setStaffId] = useState('any')
  const services = business.quickBookServiceIds
    .map((id) => catalog?.services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
  const [serviceId, setServiceId] = useState<string>(business.quickBookServiceIds[0])
  const barbers = teamOrder
    .map((id) => staff?.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  return (
    <form
      aria-labelledby="quick-title"
      className="grid gap-5 rounded-xl border border-glass-border bg-glass p-6 shadow-lg backdrop-blur-xl"
      onSubmit={(e) => {
        e.preventDefault()
        navigate(routes.bookWith({ step: '3', serviceIds: [serviceId], staffId }))
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="quick-title" className="text-xl font-semibold tracking-[-0.02em]">
          Reserva en dos toques
        </h2>
        <span
          className={cn(
            'inline-flex h-[24px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold',
            status.open ? 'bg-aqua-500 text-ink-950' : 'bg-white/10 text-gray-200',
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          <span className="tabular">{status.short}</span>
        </span>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Barbero</legend>
        {[{ id: 'any', name: 'Primero disponible' }, ...barbers.map((b) => ({ id: b.id, name: b.name }))].map((o) => {
          const checked = staffId === o.id
          const face = staffFaces[o.id]
          return (
            <label
              key={o.id}
              className={cn(
                optionBase,
                checked ? 'border-aqua-500 bg-white/[0.06]' : 'border-white/10 hover:border-white/25',
              )}
            >
              <input
                type="radio"
                name="quick-staff"
                value={o.id}
                checked={checked}
                onChange={() => setStaffId(o.id)}
                className="sr-only"
              />
              {face ? (
                <img
                  src={face.src}
                  srcSet={face.srcSet}
                  sizes="32px"
                  alt=""
                  width={32}
                  height={32}
                  className="size-8 rounded-full object-cover"
                />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-ink-800 text-aqua-400" aria-hidden>
                  <Sparkles className="size-4" strokeWidth={1.75} />
                </span>
              )}
              <span className="flex-1 text-sm font-medium">{o.name}</span>
              <span
                aria-hidden
                className={cn(
                  'grid size-5 place-items-center rounded-full border',
                  checked ? 'border-aqua-400' : 'border-white/30',
                )}
              >
                {checked && <span className="size-2.5 rounded-full bg-aqua-400" />}
              </span>
            </label>
          )
        })}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Servicio</legend>
        {services.map((s) => {
          const checked = serviceId === s.id
          return (
            <label
              key={s.id}
              className={cn(
                optionBase,
                'justify-between',
                checked ? 'border-aqua-500 bg-white/[0.06]' : 'border-white/10 hover:border-white/25',
              )}
            >
              <input
                type="radio"
                name="quick-service"
                value={s.id}
                checked={checked}
                onChange={() => setServiceId(s.id)}
                className="sr-only"
              />
              <span className="grid">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="tabular text-xs text-gray-400">{durationLabel(s.durationMin)}</span>
              </span>
              <span className="tabular text-base font-semibold">{money(s.price)}</span>
            </label>
          )
        })}
      </fieldset>

      <Button type="submit" variant="accent" size="lg" block>
        Ver disponibilidad <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />
      </Button>
    </form>
  )
}
