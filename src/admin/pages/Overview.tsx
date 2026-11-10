import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarCheck2, CalendarOff, Gauge, HandCoins, Hourglass, Wallet } from 'lucide-react'
import { routes } from '@/app/routes'
import { useNow } from '@/app/useNow'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import { useOpenStatus } from '@/features/site/useOpenStatus'
import { capitalize, formatDateLong, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { DayTimeline, TimelineLegend } from '../features/overview/DayTimeline'
import { AlertsList, BarberDayList, UpcomingList } from '../features/overview/lists'
import { cashSummary } from '../cash'
import { computeOverview, timelineBounds } from '../overview'
import { Card, EmptyState, StatCard } from '../ui/Panel'
import { isFinanceRole } from '../domain'

/** Thin bar under the occupancy figure; the number carries the meaning, the bar helps scanning. */
function Meter({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="mt-3 h-1.5 overflow-hidden rounded-full bg-fg/[0.08]"
    >
      <div className="h-full rounded-full bg-ink-950" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * The day at a glance, for the screen at the shop: what is happening now, what
 * comes next, how full each barber is and what needs attention. Refreshes every
 * minute. A barber sees only their own day; money only shows to owner and manager.
 */
export default function Overview() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const now = useNow(30_000)
  const tz = business.hours.timeZone
  const today = localDate(now, tz)
  const status = useOpenStatus()
  const isBarber = user.role === 'barber'
  const seesMoney = isFinanceRole(user.role)

  const { data: day, isError } = useQuery({
    queryKey: ['admin', 'day', today],
    queryFn: () => repo.getAgendaDay(today),
    refetchInterval: 60_000,
  })

  const ov = useMemo(
    () => (day ? computeOverview(day, now, { staffId: isBarber ? user.staffId : null }) : null),
    [day, now, isBarber, user.staffId],
  )
  const bounds = day && ov ? timelineBounds(day, ov.loads) : null
  const ctx = day ? { staff: day.staff, services: day.services, timeZone: tz } : null

  const intro = (
    <p className="text-[15px] text-fg-muted">
      {isBarber ? `Tu día, ${user.name.split(' ')[0]}. ` : ''}
      {capitalize(formatDateLong(today))} · {status.label}
    </p>
  )

  if (isError) {
    return (
      <Card className="max-w-2xl">
        <EmptyState icon={CalendarOff} title="No pudimos cargar el día">
          Revisa tu conexión; la vista se actualiza sola cada minuto.
        </EmptyState>
      </Card>
    )
  }

  if (!day || !ov || !ctx) {
    return (
      <div className="grid gap-6" aria-busy="true">
        {intro}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[132px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    )
  }

  const next = ov.next
  const nextBarber = next && day.staff.find((s) => s.id === next.staffId)
  const cash = cashSummary(ov.appointments)
  const live = ov.inProgress

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {intro}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Next appointment: the most looked-at figure on the shop screen. */}
        <div className="rounded-lg bg-ink-950 p-5 text-white" data-theme="dark">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-gray-300">Siguiente cita</p>
            <Hourglass className="size-4 text-gray-300" strokeWidth={1.75} aria-hidden />
          </div>
          {next ? (
            <>
              <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em]">
                {formatTime12(localTime(next.startsAt, tz))}
              </p>
              <p className="mt-2 truncate text-sm text-gray-200">
                {next.customer.name}
                {!isBarber && nextBarber ? ` · con ${nextBarber.name.split(' ')[0]}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-2 text-lg font-semibold">Sin más citas hoy</p>
          )}
          {live.length > 0 && (
            <p className="mt-2 flex items-center gap-2 text-[13px] text-gray-300">
              <span aria-hidden className="size-2 rounded-full bg-aqua-500" />
              {live.length === 1 ? '1 cita en curso' : `${live.length} citas en curso`}
            </p>
          )}
        </div>

        <StatCard
          label={isBarber ? 'Tus citas de hoy' : 'Citas de hoy'}
          value={ov.totals.scheduled}
          icon={CalendarCheck2}
          detail={`${ov.totals.completed} ${ov.totals.completed === 1 ? 'completada' : 'completadas'} · ${ov.totals.pending} por atender`}
        />

        <div className="rounded-lg border border-line bg-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-fg-muted">Ocupación</p>
            <Gauge className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em]">{ov.occupancyPct}%</p>
          <Meter pct={ov.occupancyPct} label="Ocupación del día" />
          <p className="mt-2 text-[13px] text-fg-muted">Tiempo reservado del disponible</p>
        </div>

        {isBarber ? (
          <StatCard
            label="Tus propinas de hoy"
            value={money(cash.tipsTotal)}
            icon={HandCoins}
            detail={`${cash.paidCount} ${cash.paidCount === 1 ? 'cita cobrada' : 'citas cobradas'}`}
          />
        ) : (
          <StatCard
            label="Caja de hoy"
            value={money(cash.total)}
            icon={Wallet}
            detail={
              <>
                <span className="tabular block">
                  Efectivo {money(cash.inByMethod.cash)} · Tarjeta {money(cash.inByMethod.card)} · Transf.{' '}
                  {money(cash.inByMethod.transfer)}
                </span>
                <span className="tabular block">
                  Incluye {money(cash.tipsTotal)} de propinas
                  {seesMoney ? ` · ${money(ov.value)} esperado en citas` : ''}
                </span>
              </>
            }
          />
        )}
      </div>

      {/* The timeline takes the full width (most legible on the shop screen); lists go below. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card
          title={isBarber ? 'Tu día' : 'Hoy por barbero'}
          actions={
            <Link
              to={routes.adminSection('agenda')}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            >
              Abrir agenda <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
            </Link>
          }
          bodyClassName="grid grid-cols-[minmax(0,1fr)] gap-5 p-5"
        >
          {!bounds ? (
            <EmptyState icon={CalendarOff} title="Hoy no abrimos">
              No hay horario de atención para este día.
            </EmptyState>
          ) : (
            <>
              <div className="hidden xl:block">
                <DayTimeline
                  loads={ov.loads}
                  appointments={ov.appointments}
                  blocks={day.blocks}
                  services={day.services}
                  bounds={bounds}
                  now={now}
                  timeZone={tz}
                  isToday
                />
              </div>
              <div className="xl:hidden">
                <BarberDayList appointments={ov.appointments} loads={ov.loads} now={now} {...ctx} />
              </div>
              <div className={'hidden border-t border-line pt-4 xl:block'}>
                <TimelineLegend />
              </div>
            </>
          )}
        </Card>

        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card
            title="Próximas citas"
            description={ov.upcoming.length ? `${ov.upcoming.length} por delante` : undefined}
          >
            <UpcomingList items={ov.upcoming.slice(0, 6)} now={now} showBarber={!isBarber} {...ctx} />
          </Card>
          <Card title="Pendientes y avisos">
            <AlertsList alerts={ov.alerts} {...ctx} />
          </Card>
        </div>
      </div>
    </div>
  )
}
