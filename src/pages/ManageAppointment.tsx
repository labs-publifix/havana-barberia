import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CalendarPlus, Phone, SearchX, XCircle } from 'lucide-react'
import type { LocalDate, Slot } from '@/domain/types'
import { SimpleHeader } from '@/components/layout/SimpleHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { CenteredState } from '@/components/layout/CenteredState'
import { StickyBar } from '@/components/booking/StickyBar'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { AppointmentSummary } from '@/features/appointment/AppointmentSummary'
import { addToCalendar } from '@/features/appointment/calendar'
import { DateTimeStep, type Conflict } from '@/features/booking/DateTimeStep'
import { useAppointment, useCatalog, useStaff, keys } from '@/app/queries'
import { useRepository } from '@/app/RepositoryContext'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { ChangeWindowClosedError, SlotUnavailableError } from '@/data'
import { capitalize, formatDateLong, formatTime12, localDate, localTime } from '@/lib/time'

/** /cita/:token — view, cancel (up to 4 h before) or reschedule (reuses step 3). */
export default function ManageAppointment() {
  const { token = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const repo = useRepository()
  const qc = useQueryClient()
  const appt = useAppointment(token)
  const catalog = useCatalog()
  const staff = useStaff()

  const rescheduling = params.get('accion') === 'reprogramar'
  const [date, setDate] = useState<LocalDate | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef(false)

  const onDateChange = useCallback((d: LocalDate) => {
    setDate(d)
    setSlot(null)
  }, [])
  const onSlotChange = useCallback((s: Slot | null) => {
    setSlot(s)
    if (s) setConflict(null)
  }, [])

  const a = appt.data
  const tz = business.hours.timeZone
  const cutoffMs = business.policy.changeCutoffMin * 60_000
  const startsIn = a ? Date.parse(a.startsAt) - Date.now() : 0
  const isUpcoming = a ? (a.status === 'booked' || a.status === 'confirmed') && startsIn > 0 : false
  const canChange = isUpcoming && startsIn >= cutoffMs

  const refresh = async (next?: typeof a) => {
    if (next) qc.setQueryData(keys.appointment(token), next)
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.appointment(token) }),
      qc.invalidateQueries({ queryKey: ['slots'] }),
    ])
  }

  async function run(fn: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      if (err instanceof SlotUnavailableError) {
        setConflict({ alternatives: err.alternatives })
        setSlot(null)
        await qc.invalidateQueries({ queryKey: ['slots'] })
      } else if (err instanceof ChangeWindowClosedError) {
        setError(`${err.message} Llámanos y lo vemos juntos.`)
        await refresh()
      } else {
        setError('No pudimos guardar el cambio. Revisa tu conexión e inténtalo de nuevo.')
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const cancel = () =>
    run(async () => {
      await repo.cancelAppointment(token)
      setConfirmCancel(false)
      setNotice('Cancelamos tu cita. Tu horario quedó libre para alguien más.')
      await refresh()
    })

  const reschedule = () =>
    run(async () => {
      if (!slot) return
      const updated = await repo.rescheduleAppointment(token, slot)
      setNotice(
        `Movimos tu cita al ${formatDateLong(localDate(updated.startsAt, tz))} a las ${formatTime12(localTime(updated.startsAt, tz))}`,
      )
      await refresh(updated)
      navigate(-1)
    })

  const loading = appt.isPending || catalog.isPending || staff.isPending

  return (
    <div className="min-h-dvh bg-page">
      <SimpleHeader onBack={rescheduling ? () => navigate(-1) : undefined} backLabel="Mi cita" />
      <main className="mx-auto grid max-w-booking gap-6 px-4 pb-12 pt-6">
        {loading ? (
          <LoadingRegion label="Cargando tu cita…">
            <div className="grid gap-4">
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-64 rounded-lg" />
              <Skeleton className="h-12 rounded-full" />
            </div>
          </LoadingRegion>
        ) : !a ? (
          <CenteredState
            icon={SearchX}
            title="No encontramos esta cita"
            actions={
              <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
                Reservar una cita
              </Link>
            }
          >
            Revisa que el enlace esté completo. Si necesitas ayuda, llámanos al {business.phoneDisplay}.
          </CenteredState>
        ) : rescheduling && canChange ? (
          <>
            <div className="grid gap-2">
              <h1 className="t-h1">Elige el nuevo horario</h1>
              <p className="text-fg-muted">
                Ahora: {capitalize(formatDateLong(localDate(a.startsAt, tz)))},{' '}
                {formatTime12(localTime(a.startsAt, tz))}
              </p>
            </div>
            {error && (
              <Alert tone="danger" title="No se pudo reprogramar.">
                {error}
              </Alert>
            )}
            <DateTimeStep
              serviceIds={a.serviceIds}
              staffId={a.staffId}
              staff={staff.data ?? []}
              date={date}
              slotStartsAt={slot?.startsAt ?? null}
              onDateChange={onDateChange}
              onSlotChange={onSlotChange}
              excludeAppointmentId={a.id}
              conflict={conflict}
            />
            <StickyBar
              summary={
                <p className="text-sm text-fg-muted">
                  {slot ? (
                    <>
                      Nuevo horario:{' '}
                      <strong className="tabular text-fg">
                        {formatDateLong(localDate(slot.startsAt, tz))}, {formatTime12(slot.time)}
                      </strong>
                    </>
                  ) : (
                    'Elige un día y una hora'
                  )}
                </p>
              }
            >
              <Button size="lg" block disabled={!slot} loading={busy} onClick={reschedule}>
                Confirmar nuevo horario
              </Button>
            </StickyBar>
          </>
        ) : (
          <>
            <div className="grid gap-2">
              <h1 className="t-h1">Tu cita</h1>
              <p className="text-fg-muted">A nombre de {a.customer.name}.</p>
            </div>

            {notice && (
              <Alert tone="success" title="Listo.">
                {notice}
              </Alert>
            )}
            {error && (
              <Alert tone="danger" title="No se pudo completar.">
                {error}
              </Alert>
            )}

            <AppointmentSummary
              appointment={a}
              services={catalog.data?.services ?? []}
              staff={staff.data?.find((s) => s.id === a.staffId)}
            />

            {a.status === 'cancelled' ? (
              <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
                Reservar otra cita
              </Link>
            ) : !isUpcoming ? (
              <Alert tone="info" title="Esta cita ya pasó.">
                ¿Te esperamos de nuevo?{' '}
                <Link to={routes.book()} className="font-semibold underline underline-offset-4">
                  Reserva otra cita
                </Link>
              </Alert>
            ) : canChange ? (
              <div className="grid gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  block
                  onClick={() => {
                    setNotice(null)
                    setError(null)
                    setParams({ accion: 'reprogramar' })
                  }}
                >
                  <CalendarClock className="size-5" strokeWidth={1.75} aria-hidden />
                  Reprogramar
                </Button>
                <Button variant="ghost" size="lg" block onClick={() => addToCalendar(a, catalog.data?.services ?? [])}>
                  <CalendarPlus className="size-5" strokeWidth={1.75} aria-hidden />
                  Agregar al calendario
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  block
                  className="text-fg-danger"
                  onClick={() => setConfirmCancel(true)}
                >
                  <XCircle className="size-5" strokeWidth={1.75} aria-hidden />
                  Cancelar cita
                </Button>
                <p className="text-center text-sm text-fg-muted">
                  Puedes hacer cambios hasta {business.policy.changeCutoffMin / 60} horas antes de tu cita.
                </p>
              </div>
            ) : (
              <Alert
                tone="warning"
                title={`Faltan menos de ${business.policy.changeCutoffMin / 60} horas para tu cita.`}
                action={
                  <a href={business.phoneHref} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                    <Phone className="size-4" strokeWidth={1.75} aria-hidden />
                    Llamar al {business.phoneDisplay}
                  </a>
                }
              >
                Ya no puedes cancelar ni reprogramar en línea. Si no puedes llegar, llámanos para liberar tu horario.
              </Alert>
            )}
          </>
        )}
      </main>
      {!rescheduling && <SiteFooter tone="light" />}

      <Dialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="¿Cancelar tu cita?"
        description="Liberaremos tu horario para alguien más. Puedes volver a reservar cuando quieras."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Mantener mi cita
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
              Sí, cancelar cita
            </Button>
          </>
        }
      />
    </div>
  )
}
