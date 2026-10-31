import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarX2 } from 'lucide-react'
import type { LocalDate, Slot, Staff, StaffChoice } from '@/domain/types'
import { DayStrip, type DayOption } from '@/components/booking/DayStrip'
import { SlotGrid } from '@/components/booking/SlotGrid'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { useSlots } from '@/app/queries'
import { nearestAvailable } from '@/lib/availability'
import { business } from '@/config/business'
import { addDays, capitalize, formatDateLong, formatTime12, localDate, weekdayOf } from '@/lib/time'

const DAYS_SHOWN = 30

export interface Conflict {
  alternatives: Slot[]
}

/**
 * Step 3 (date and time). Also used to reschedule an appointment.
 * Picks the first open day automatically and skips ahead while the chosen
 * day has nothing left, so people land on bookable times.
 */
export function DateTimeStep({
  serviceIds,
  staffId,
  staff,
  date,
  slotStartsAt,
  onDateChange,
  onSlotChange,
  excludeAppointmentId,
  conflict,
}: {
  serviceIds: string[]
  staffId: StaffChoice
  staff: Staff[]
  date: LocalDate | null
  slotStartsAt: string | null
  onDateChange: (d: LocalDate, opts?: { auto?: boolean }) => void
  onSlotChange: (slot: Slot | null) => void
  excludeAppointmentId?: string
  conflict?: Conflict | null
}) {
  const today = localDate(new Date(), business.hours.timeZone)

  const days: DayOption[] = useMemo(() => {
    const working = staffId === 'any' ? staff : staff.filter((s) => s.id === staffId)
    return Array.from({ length: DAYS_SHOWN }, (_, i) => {
      const d = addDays(today, i)
      const wd = weekdayOf(d)
      const shopOpen = (business.hours.weekly[wd] ?? []).length > 0
      const someoneWorks = working.some((s) => (s.schedule[wd] ?? []).length > 0)
      return { date: d, disabled: !shopOpen || !someoneWorks }
    })
  }, [today, staff, staffId])

  const firstOpen = days.find((d) => !d.disabled)?.date ?? null
  const autoPicked = useRef(0)

  useEffect(() => {
    if (!date && firstOpen) {
      autoPicked.current = 1
      onDateChange(firstOpen, { auto: true })
    }
  }, [date, firstOpen, onDateChange])

  const query = date ? { serviceIds, staffId, date, excludeAppointmentId } : null
  const { data: slots, isPending, isError, refetch } = useSlots(query)
  const available = slots?.filter((s) => s.available) ?? []

  const nextOpenAfter = (d: LocalDate) => days.find((x) => x.date > d && !x.disabled)?.date ?? null

  // Auto-picked day is full: move to the next open one (up to a week).
  useEffect(() => {
    if (!date || !slots || available.length > 0) return
    if (autoPicked.current === 0 || autoPicked.current > 7) return
    const next = nextOpenAfter(date)
    if (next) {
      autoPicked.current++
      onDateChange(next, { auto: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, date])

  // The selected time was taken by someone else while choosing.
  const selected = slots?.find((s) => s.startsAt === slotStartsAt)
  const lostSelection = Boolean(slotStartsAt && slots && (!selected || !selected.available))
  const [lost, setLost] = useState<Conflict | null>(null)
  useEffect(() => {
    if (lostSelection && slots && slotStartsAt) {
      setLost({ alternatives: nearestAvailable(slots, slotStartsAt) })
      onSlotChange(null)
    }
  }, [lostSelection, slots, slotStartsAt, onSlotChange])
  useEffect(() => {
    if (slotStartsAt) setLost(null)
  }, [slotStartsAt, date])

  const shownConflict = conflict ?? lost
  const alternatives = shownConflict?.alternatives ?? []
  const nextDay = date ? nextOpenAfter(date) : null

  return (
    <div className="grid gap-5">
      <DayStrip
        days={days}
        value={date}
        today={today}
        onChange={(d) => {
          autoPicked.current = 0
          onDateChange(d)
        }}
      />

      {date && <h3 className="t-h4">{capitalize(formatDateLong(date))}</h3>}

      {shownConflict && (
        <Alert tone="danger" title="Ese horario ya no está disponible.">
          {alternatives.length > 0
            ? `Alguien lo apartó hace un momento. Los más cercanos: ${alternatives.map((a) => formatTime12(a.time)).join(', ')}.`
            : 'Alguien lo apartó hace un momento. Elige otro horario u otro día.'}
        </Alert>
      )}

      {isError ? (
        <Alert
          tone="danger"
          title="No pudimos cargar los horarios."
          action={
            <Button size="sm" variant="secondary" onClick={() => refetch()}>
              Intentar de nuevo
            </Button>
          }
        >
          Revisa tu conexión e inténtalo de nuevo.
        </Alert>
      ) : isPending || !date ? (
        <LoadingRegion label="Buscando horarios…">
          <div className="grid gap-3">
            <Skeleton className="h-4 w-20" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          </div>
        </LoadingRegion>
      ) : available.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
          <CalendarX2 className="size-8 text-fg-muted" strokeWidth={1.5} aria-hidden />
          <p className="t-h4">Este día ya no quedan horarios</p>
          <p className="max-w-[32ch] text-sm text-fg-muted">
            {staffId === 'any'
              ? 'Prueba otro día.'
              : 'Prueba otro día o elige “Primero disponible” para ver más opciones.'}
          </p>
          {nextDay && (
            <Button variant="secondary" size="sm" onClick={() => onDateChange(nextDay)}>
              Ver el {formatDateLong(nextDay)}
            </Button>
          )}
        </div>
      ) : (
        <>
          {available.length <= 3 && (
            <Alert tone="warning" title="Pocos horarios.">
              {available.length === 1 ? 'Queda 1 espacio este día.' : `Quedan ${available.length} espacios este día.`}
            </Alert>
          )}
          <SlotGrid
            slots={slots}
            value={slotStartsAt}
            onChange={onSlotChange}
            highlight={alternatives.map((a) => a.startsAt)}
          />
        </>
      )}
    </div>
  )
}
