import { useEffect, useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Ban, ChevronLeft, ChevronRight, Footprints, Plus } from 'lucide-react'
import { useCatalog } from '@/app/queries'
import { useNow } from '@/app/useNow'
import { Avatar } from '@/components/booking/Avatar'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { Appointment, LocalDate, TimeBlock } from '@/domain/types'
import { cn } from '@/lib/cn'
import { capitalize, formatDateLong, formatDay, localDate, weekdayOf } from '@/lib/time'
import { AgendaList } from '../agenda/AgendaList'
import { AppointmentPanel } from '../agenda/AppointmentPanel'
import { BlockPanel, type BlockDraft } from '../agenda/BlockPanel'
import { gridBounds, shiftDate, weekOf, type AgendaView } from '../agenda/model'
import { NewAppointmentPanel, type NewAppointmentDraft } from '../agenda/NewAppointmentPanel'
import { TimeGrid, type GridColumn } from '../agenda/TimeGrid'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { Kbd, Segmented, Select } from '../ui/controls'

const isDate = (s: string | null): s is LocalDate => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * Agenda: day (one column per barber) or week (one column per day for a
 * barber). Appointments open a side panel with every action; desk roles can
 * create appointments, walk-ins and blocks. State lives in the URL
 * (?fecha, ?vista, ?barbero, ?cita) so links and reloads land in the same place.
 */
export default function Agenda() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const now = useNow(30_000)
  const tz = business.hours.timeZone
  const today = localDate(now, tz)
  const [params, setParams] = useSearchParams()
  const canManage = user.role !== 'barber'

  const date = isDate(params.get('fecha')) ? params.get('fecha')! : today
  const view: AgendaView = params.get('vista') === 'semana' ? 'semana' : 'dia'
  const barberParam = params.get('barbero')
  const openId = params.get('cita')

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  const dates = view === 'semana' ? weekOf(date) : [date]
  const results = useQueries({
    queries: dates.map((d) => ({
      queryKey: ['admin', 'day', d],
      queryFn: () => repo.getAgendaDay(d),
      refetchInterval: 60_000,
    })),
  })
  const days = results.every((r) => r.data) ? results.map((r) => r.data!) : null
  const { data: catalog } = useCatalog()

  const staffAll = days?.[0]?.staff ?? []
  const ownId = user.role === 'barber' ? user.staffId : null
  const weekStaffId =
    ownId ?? (barberParam && staffAll.some((s) => s.id === barberParam) ? barberParam : staffAll[0]?.id)
  const dayStaff = ownId
    ? staffAll.filter((s) => s.id === ownId)
    : barberParam
      ? staffAll.filter((s) => s.id === barberParam)
      : staffAll

  const columns: GridColumn[] = useMemo(() => {
    if (!days) return []
    if (view === 'dia') {
      const d = days[0]!
      return dayStaff.map((s) => {
        const appts = d.appointments.filter((a) => a.staffId === s.id)
        return {
          key: s.id,
          label: `Agenda de ${s.name}`,
          header: (
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={s.name} src={s.photoUrl} size={32} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="tabular text-xs text-fg-muted">
                  {(s.schedule[weekdayOf(d.date)] ?? []).length
                    ? `${appts.filter((a) => a.status !== 'cancelled').length} citas`
                    : 'Descansa'}
                </p>
              </div>
            </div>
          ),
          date: d.date,
          staffId: s.id,
          ranges: s.schedule[weekdayOf(d.date)] ?? [],
          appointments: appts,
          blocks: d.blocks.filter((b) => b.staffId === null || b.staffId === s.id),
          isToday: d.date === today,
        }
      })
    }
    const s = staffAll.find((x) => x.id === weekStaffId)
    if (!s) return []
    return days.map((d) => {
      const appts = d.appointments.filter((a) => a.staffId === s.id)
      const isToday = d.date === today
      return {
        key: d.date,
        label: `${s.name}, ${formatDateLong(d.date)}`,
        header: (
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold', isToday && 'text-fg')}>
              {capitalize(formatDay(d.date, 'EEE d'))}
              {isToday && <span className="ml-1.5 text-xs font-medium text-fg-muted">hoy</span>}
            </p>
            <p className="tabular text-xs text-fg-muted">
              {(s.schedule[weekdayOf(d.date)] ?? []).length
                ? `${appts.filter((a) => a.status !== 'cancelled').length} citas`
                : 'Descansa'}
            </p>
          </div>
        ),
        date: d.date,
        staffId: s.id,
        ranges: s.schedule[weekdayOf(d.date)] ?? [],
        appointments: appts,
        blocks: d.blocks.filter((b) => b.staffId === null || b.staffId === s.id),
        isToday,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, view, barberParam, weekStaffId, ownId, today])

  const bounds = days
    ? gridBounds(
        days,
        columns.map((c) => c.staffId),
      )
    : null
  const allAppointments = days?.flatMap((d) => d.appointments) ?? []
  const opened: Appointment | null = (openId && allAppointments.find((a) => a.id === openId)) || null

  const [newDraft, setNewDraft] = useState<NewAppointmentDraft | null>(null)
  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null)
  const anyPanel = !!opened || !!newDraft || !!blockDraft

  const startNew = (kind: NewAppointmentDraft['kind'], extra: Partial<NewAppointmentDraft> = {}) =>
    setNewDraft({
      kind,
      staffId: view === 'dia' && dayStaff.length === 1 ? dayStaff[0]!.id : 'any',
      date: date < today ? today : date,
      ...extra,
    })

  // "N" opens a new appointment, like the shortcut hinted in the components page.
  useEffect(() => {
    if (!canManage) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (anyPanel || e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]'))
        return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        startNew('cita')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const week = weekOf(date)
  const title =
    view === 'dia'
      ? capitalize(formatDateLong(date))
      : `Semana del ${formatDay(week[0]!, 'd')} al ${formatDay(week[6]!, "d 'de' MMMM")}`

  const openAppointment = (a: Appointment) => set({ cita: a.id })
  const openBlock = (b: TimeBlock) => setBlockDraft({ mode: 'view', block: b })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => set({ fecha: null })}
            disabled={date === today}
            className={buttonClass({ variant: 'secondary', size: 'sm', className: 'mr-1' })}
          >
            Hoy
          </button>
          <button
            type="button"
            aria-label={view === 'semana' ? 'Semana anterior' : 'Día anterior'}
            onClick={() => set({ fecha: shiftDate(date, view, -1) })}
            className="grid size-10 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus coarse:size-tap"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={view === 'semana' ? 'Semana siguiente' : 'Día siguiente'}
            onClick={() => set({ fecha: shiftDate(date, view, 1) })}
            className="grid size-10 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus coarse:size-tap"
          >
            <ChevronRight className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <h2 className="min-w-0 text-lg font-semibold tracking-[-0.01em]" aria-live="polite">
          {title}
        </h2>
        <label className="sr-only" htmlFor="agenda-date">
          Ir a fecha
        </label>
        <input
          id="agenda-date"
          type="date"
          value={date}
          onChange={(e) => isDate(e.target.value) && set({ fecha: e.target.value === today ? null : e.target.value })}
          className="h-10 rounded-md border-[1.5px] border-line-strong bg-raised px-2.5 text-base focus:border-fg focus:outline-none focus:ring-4 focus:ring-aqua-500/30 coarse:h-11"
        />

        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          <Segmented<AgendaView>
            label="Vista"
            value={view}
            onChange={(v) => set({ vista: v === 'dia' ? null : v })}
            options={[
              { value: 'dia', label: 'Día' },
              { value: 'semana', label: 'Semana' },
            ]}
          />
          {!ownId && staffAll.length > 0 && (
            <div className="w-48">
              <Select
                label="Barbero"
                hideLabel
                value={view === 'semana' ? (weekStaffId ?? '') : (barberParam ?? '')}
                onChange={(e) => set({ barbero: e.target.value || null })}
                options={[
                  ...(view === 'dia' ? [{ value: '', label: 'Todos los barberos' }] : []),
                  ...staffAll.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>
          )}
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setBlockDraft({ mode: 'new', staffId: barberParam, date })}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                <Ban className="size-4" strokeWidth={1.75} aria-hidden /> Bloquear
              </button>
              <button
                type="button"
                onClick={() => startNew('walk_in', { date: today })}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                <Footprints className="size-4" strokeWidth={1.75} aria-hidden /> Walk-in
              </button>
              <button
                type="button"
                onClick={() => startNew('cita')}
                className={buttonClass({ size: 'sm' })}
                aria-keyshortcuts="N"
              >
                <Plus className="size-4" strokeWidth={2} aria-hidden /> Nueva cita
                <span className="hidden coarse:hidden lg:inline-grid">
                  <Kbd>N</Kbd>
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {!days || !bounds ? (
        <Skeleton className="h-[640px] rounded-lg" />
      ) : (
        <>
          <section aria-label="Agenda" className="hidden rounded-lg border border-line bg-raised lg:block">
            <TimeGrid
              columns={columns}
              bounds={bounds}
              now={now}
              timeZone={tz}
              services={days[0]!.services}
              compact={view === 'semana'}
              onOpenAppointment={openAppointment}
              onOpenBlock={openBlock}
              onPickSlot={
                canManage ? (col, time) => startNew('cita', { staffId: col.staffId, date: col.date, time }) : undefined
              }
            />
          </section>
          <div className="lg:hidden">
            <AgendaList
              columns={columns}
              now={now}
              timeZone={tz}
              services={days[0]!.services}
              onOpenAppointment={openAppointment}
              onOpenBlock={openBlock}
            />
          </div>
        </>
      )}

      <AppointmentPanel
        appointment={opened}
        staff={staffAll}
        services={days?.[0]?.services ?? []}
        timeZone={tz}
        now={now}
        canManage={canManage}
        onClose={() => set({ cita: null })}
      />
      <NewAppointmentPanel
        draft={newDraft}
        staff={staffAll}
        categories={catalog?.categories ?? []}
        services={catalog?.services ?? []}
        timeZone={tz}
        now={now}
        onClose={() => setNewDraft(null)}
      />
      <BlockPanel
        draft={blockDraft}
        staff={staffAll}
        timeZone={tz}
        canManage={canManage}
        onClose={() => setBlockDraft(null)}
      />
    </div>
  )
}
