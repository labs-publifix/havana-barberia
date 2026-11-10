import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { useBusinessHours } from '@/app/queries'
import { routes } from '@/app/routes'
import type { WeeklySchedule } from '@/domain/types'
import { DAY_NAMES, SHOP_LIMITS, shopHoursErrors } from '@/lib/schedule'
import { formatDateLong, formatTime12, localDate, localTime } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import type { BusinessHoursChange } from '../domain'
import { ScheduleEditor } from '../team/ScheduleEditor'
import { Card } from '../ui/Panel'
import { useToast } from '../ui/Toast'

/**
 * Ajustes › Horario: when the shop opens. It is the frame for every barber's
 * shifts; the site (hours, "abierto ahora"), the booking and the agenda read it.
 */
export function HoursView() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const saved = useBusinessHours()
  const [draft, setDraft] = useState<WeeklySchedule | null>(null)
  const [result, setResult] = useState<BusinessHoursChange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const weekly = draft ?? saved.weekly
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved.weekly)
  const problems = Object.keys(shopHoursErrors(weekly)).length

  const save = useMutation({
    mutationFn: () => repo.saveBusinessHours(weekly),
    onSuccess: async (r) => {
      setResult(r)
      setDraft(null)
      setError(null)
      await Promise.all(
        [['hours'], ['admin'], ['slots'], ['staff']].map((queryKey) => qc.invalidateQueries({ queryKey })),
      )
      toast('Horario guardado: ya se ve en el sitio y en la reserva')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card
        title="Horario de la barbería"
        description="Cuándo abre la barbería. Es el marco de los turnos de cada barbero: en la reserva solo aparecen horas en que la barbería está abierta y el barbero trabaja. También es el horario que se muestra en el sitio."
      >
        <ScheduleEditor
          variant="shop"
          value={weekly}
          shop={SHOP_LIMITS}
          onChange={(w) => {
            setDraft(w)
            setResult(null)
            setError(null)
          }}
        />
        <p className="mt-4 text-[13px] text-fg-muted">
          Días festivos o cierres de un día: agrégalos como ausencia de toda la barbería en{' '}
          <Link to={routes.adminSection('equipo')} className="underline underline-offset-4 hover:text-fg">
            Equipo
          </Link>
          .
        </p>
      </Card>

      {error && (
        <Alert tone="danger" title="No se pudo guardar">
          {error}
        </Alert>
      )}

      {result && (result.staffOutside.length > 0 || result.appointmentsOutside.length > 0) && (
        <Alert tone="warning" title="Revisa lo que quedó fuera del nuevo horario">
          {result.staffOutside.length > 0 && (
            <p>
              Turnos fuera del horario (esas horas ya no se pueden reservar; ajústalos en Equipo):{' '}
              {result.staffOutside
                .map((s) => `${s.name} (${s.days.map((d) => DAY_NAMES[d]!.toLowerCase()).join(', ')})`)
                .join('; ')}
              .
            </p>
          )}
          {result.appointmentsOutside.length > 0 && (
            <>
              <p className="mt-2">Citas próximas fuera del horario (siguen agendadas; muévelas si hace falta):</p>
              <ul className="mt-1 list-disc pl-5">
                {result.appointmentsOutside.slice(0, 10).map((a) => (
                  <li key={a.id}>
                    {formatDateLong(localDate(a.startsAt, saved.timeZone))},{' '}
                    {formatTime12(localTime(a.startsAt, saved.timeZone))} · {a.customer.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Alert>
      )}

      {dirty && (
        <div
          role="region"
          aria-label="Cambios sin guardar"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised px-5 py-3 shadow-lg"
        >
          <p className="text-sm font-medium">Cambiaste el horario. Aplica al sitio y a la reserva en cuanto guardes.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setError(null)
              }}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={save.isPending || problems > 0}
              onClick={() => save.mutate()}
              className={buttonClass({ size: 'sm' })}
            >
              Guardar horario
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
