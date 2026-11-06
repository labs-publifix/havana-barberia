import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, CalendarOff, ChevronRight, Plus } from 'lucide-react'
import { Avatar } from '@/components/booking/Avatar'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import { cn } from '@/lib/cn'
import { rangesLabel, weeklyMinutes } from '@/lib/schedule'
import { formatDay, localDate, weekdayOf } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { commissionLabel } from '../team/model'
import { StaffPanel, type StaffDraft } from '../team/StaffPanel'
import { PageHeader } from '../ui/Panel'
import { useToast } from '../ui/Toast'

const tz = business.hours.timeZone

/**
 * Equipo y horarios: every barber with today's shift, weekly hours, services,
 * commission (owner and manager) and upcoming time off. Availability on the
 * site and in the panel comes from here.
 */
export default function Team() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const canEdit = user.role === 'owner' || user.role === 'manager'
  const seesFinance = canEdit
  const qc = useQueryClient()
  const toast = useToast()
  const { data: team } = useQuery({ queryKey: ['admin', 'team'], queryFn: () => repo.getTeam() })
  const { data: catalog } = useQuery({ queryKey: ['admin', 'catalog'], queryFn: () => repo.getCatalog() })
  const [draft, setDraft] = useState<StaffDraft | null>(null)
  const today = localDate(new Date(), tz)

  const move = (id: string, dir: -1 | 1) =>
    repo
      .moveStaff(id, dir)
      .then(() => Promise.all([['admin'], ['staff']].map((queryKey) => qc.invalidateQueries({ queryKey }))))
      .catch((e: unknown) => toast(errorMessage(e), 'danger'))

  if (!team || !catalog) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    )
  }

  const total = catalog.services.length
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description="Quién trabaja, cuándo y qué servicios da. De aquí sale la disponibilidad del sitio y de la agenda."
        actions={
          canEdit ? (
            <button type="button" onClick={() => setDraft({ mode: 'new' })} className={buttonClass({ size: 'sm' })}>
              <Plus className="size-4" strokeWidth={2} aria-hidden /> Nuevo barbero
            </button>
          ) : (
            <Badge>Solo lectura · ausencias editables</Badge>
          )
        }
      />

      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Equipo">
        {team.staff.map((s, i) => {
          const todayRanges = s.schedule[weekdayOf(today)] ?? []
          const count = s.serviceIds === 'all' ? total : s.serviceIds.length
          const nextOff = team.blocks.find((b) => b.staffId === s.id)
          const c = team.commissions.find((x) => x.staffId === s.id)
          return (
            <li key={s.id} className={cn('grid rounded-lg border border-line bg-raised', !s.active && 'bg-surface')}>
              <div className="flex items-start gap-4 p-5">
                <Avatar name={s.name} src={s.photoUrl} size={56} />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setDraft({ mode: 'edit', id: s.id })}
                    className="rounded text-left text-base font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {s.name}
                  </button>
                  <p className="text-sm text-fg-muted">{s.title || 'Barbero'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>}
                    {nextOff && (
                      <Badge tone="warning">
                        {nextOff.reason} · {formatDay(localDate(nextOff.startsAt, tz), "d 'de' MMM")}
                      </Badge>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Subir a ${s.name}`}
                      disabled={i === 0}
                      onClick={() => void move(s.id, -1)}
                      className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`Bajar a ${s.name}`}
                      disabled={i === team.staff.length - 1}
                      onClick={() => void move(s.id, 1)}
                      className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
              </div>
              <dl className="grid gap-2 border-t border-line px-5 py-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Hoy</dt>
                  <dd className="tabular text-right">{rangesLabel(todayRanges)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Horas por semana</dt>
                  <dd className="tabular">{Math.round(weeklyMinutes(s.schedule) / 60)} h</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Servicios</dt>
                  <dd className="tabular">{count === total ? 'Todos' : `${count} de ${total}`}</dd>
                </div>
                {seesFinance && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">Comisión</dt>
                    <dd className={cn('text-right', c?.value == null && 'text-fg-muted')}>{commissionLabel(c)}</dd>
                  </div>
                )}
              </dl>
              <button
                type="button"
                onClick={() => setDraft({ mode: 'edit', id: s.id })}
                aria-label={`${canEdit ? 'Editar' : 'Ver'} a ${s.name}`}
                className="flex items-center justify-between border-t border-line px-5 py-3 text-sm font-semibold hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                {canEdit ? 'Perfil, horario, servicios y comisión' : 'Ver horario y ausencias'}
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>

      {team.blocks.some((b) => b.staffId === null) && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <CalendarOff className="size-4" aria-hidden />
          Los cierres de toda la barbería (festivos) se agregan desde la Agenda con «Bloquear» › Toda la barbería.
        </p>
      )}

      <StaffPanel
        draft={draft}
        team={team}
        services={catalog.services}
        categories={catalog.categories}
        canEdit={canEdit}
        seesFinance={seesFinance}
        onClose={() => setDraft(null)}
      />
    </div>
  )
}
