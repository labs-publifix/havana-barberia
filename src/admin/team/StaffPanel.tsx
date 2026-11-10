import { useId, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { routes } from '@/app/routes'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { business } from '@/config/business'
import type {
  Appointment,
  LocalDate,
  Service,
  ServiceCategory,
  Staff,
  StaffCommission,
  WeeklySchedule,
} from '@/domain/types'
import { cn } from '@/lib/cn'
import { scheduleErrors } from '@/lib/schedule'
import {
  addDays,
  capitalize,
  durationLabel,
  formatDay,
  formatTime12,
  localDate,
  localTime,
  money,
  zonedInstant,
} from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import type { AdminTeam, StaffInput } from '../domain'
import { errorMessage } from '../agenda/useAgendaActions'
import { Input, Segmented, Switch } from '../ui/controls'
import { DatePicker } from '../ui/DatePicker'
import { ImageUploader } from '../ui/ImageUploader'
import { Select } from '../ui/Select'
import { SidePanel } from '../ui/SidePanel'
import { TabPanel, Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { commissionLabel, commissionOn } from './model'
import { useFinanceWeek } from '../useFinanceWeek'
import { ScheduleEditor } from './ScheduleEditor'

export type StaffDraft = { mode: 'new' } | { mode: 'edit'; id: string }
type Tab = 'perfil' | 'horario' | 'servicios' | 'comision' | 'ausencias'

interface Form {
  name: string
  title: string
  photoUrl: string | null
  active: boolean
  schedule: WeeklySchedule
  serviceIds: string[]
  mode: StaffCommission['mode']
  value: string
  overrides: Record<string, string>
}

const tz = business.hours.timeZone
const REASONS = ['Vacaciones', 'Día libre', 'Capacitación', 'Incapacidad', 'Otro']

/** Time off for one barber: upcoming list, add a date range, remove. Reception can use it too. */
function Absences({ staff, team }: { staff: Staff; team: AdminTeam }) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const today = localDate(new Date(), tz)
  const [from, setFrom] = useState<LocalDate>(today)
  const [to, setTo] = useState<LocalDate>(today)
  const [reason, setReason] = useState(REASONS[0]!)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const add = useMutation({
    mutationFn: () =>
      repo.createBlock({
        staffId: staff.id,
        startsAt: zonedInstant(from, '00:00', tz).toISOString(),
        endsAt: zonedInstant(addDays(to < from ? from : to, 1), '00:00', tz).toISOString(),
        reason,
      }),
    onSuccess: () => {
      toast('Ausencia registrada')
      setError(null)
      void refresh()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const remove = useMutation({ mutationFn: (id: string) => repo.deleteBlock(id), onSuccess: refresh })
  const own = team.blocks.filter((b) => b.staffId === staff.id)
  const shop = team.blocks.filter((b) => b.staffId === null)
  const span = (s: string, e: string) => {
    const a = localDate(s, tz)
    const b = localDate(new Date(Date.parse(e) - 1).toISOString(), tz)
    const allDay = localTime(s, tz) === '00:00' && localTime(e, tz) === '00:00'
    if (!allDay)
      return `${capitalize(formatDay(a, "EEE d 'de' MMM"))}, ${formatTime12(localTime(s, tz))} – ${formatTime12(localTime(e, tz))}`
    return a === b
      ? capitalize(formatDay(a, "EEEE d 'de' MMMM"))
      : `Del ${formatDay(a, "d 'de' MMM")} al ${formatDay(b, "d 'de' MMM")}`
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold">Registrar ausencia</h3>
        {error && <Alert tone="danger" title={error} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <DatePicker
            label="Desde"
            value={from}
            today={today}
            min={today}
            onChange={(d) => {
              setFrom(d)
              if (to < d) setTo(d)
            }}
          />
          <DatePicker label="Hasta" value={to} today={today} min={from} onChange={setTo} />
        </div>
        <Select
          label="Motivo"
          value={reason}
          onValueChange={setReason}
          options={REASONS.map((r) => ({ value: r, label: r }))}
        />
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={add.isPending}
          className={buttonClass({ size: 'sm', className: 'justify-self-start' })}
        >
          <Plus className="size-4" aria-hidden /> Bloquear esos días
        </button>
        <p className="text-[13px] text-fg-muted">
          Esos días nadie podrá reservar con {staff.name.split(' ')[0]}. Si ya tiene citas, primero muévelas.
        </p>
      </section>

      <section className="grid gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Próximas ausencias</h3>
        {own.length ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {own.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{b.reason}</span>
                  <span className="block text-fg-muted">{span(b.startsAt, b.endsAt)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(b.id, { onSuccess: () => toast('Ausencia quitada') })}
                  aria-label={`Quitar ${b.reason}, ${span(b.startsAt, b.endsAt)}`}
                  className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Sin ausencias próximas.</p>
        )}
        {shop.length > 0 && (
          <p className="text-[13px] text-fg-muted">
            Además, la barbería tiene {shop.length} {shop.length === 1 ? 'cierre' : 'cierres'} para todos (se
            administran en la Agenda).
          </p>
        )}
      </section>
    </div>
  )
}

/**
 * One barber: profile, weekly shifts, services they offer (one switch each),
 * commission (owner and manager only) and time off. Profile, schedule,
 * services and commission save together; time off applies right away.
 */
export function StaffPanel({
  draft,
  team,
  services,
  categories,
  canEdit,
  seesFinance,
  onClose,
}: {
  draft: StaffDraft | null
  team: AdminTeam
  services: Service[]
  categories: ServiceCategory[]
  canEdit: boolean
  seesFinance: boolean
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const idBase = useId().replace(/:/g, '')
  const [tab, setTab] = useState<Tab>('perfil')
  const [form, setForm] = useState<Form | null>(null)
  const [shownFor, setShownFor] = useState<StaffDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outside, setOutside] = useState<Appointment[] | null>(null)
  const { current: weekFrom } = useFinanceWeek()
  const todayLocal = localDate(new Date(), tz)
  const [commissionFrom, setCommissionFrom] = useState<string | null>(null)
  const editing = draft?.mode === 'edit' ? team.staff.find((s) => s.id === draft.id) : undefined
  const commission = editing ? team.commissions.find((c) => c.staffId === editing.id) : undefined

  if (draft !== shownFor) {
    setShownFor(draft)
    setTab('perfil')
    setError(null)
    setOutside(null)
    setCommissionFrom(null)
    const shop = business.hours.weekly
    setForm(
      !draft
        ? null
        : {
            name: editing?.name ?? '',
            title: editing?.title ?? '',
            photoUrl: editing?.photoUrl ?? null,
            active: editing?.active ?? true,
            schedule: editing?.schedule ?? shop.map((d) => d.map((r) => ({ ...r }))),
            serviceIds: !editing || editing.serviceIds === 'all' ? services.map((s) => s.id) : editing.serviceIds,
            mode: commission?.mode ?? 'percent',
            value: commission?.value === null || commission?.value === undefined ? '' : String(commission.value),
            overrides: Object.fromEntries(Object.entries(commission?.overrides ?? {}).map(([k, v]) => [k, String(v)])),
          },
    )
  }

  const save = useMutation({
    mutationFn: (input: StaffInput) => repo.saveStaff(input),
    onSuccess: () =>
      Promise.all([['admin'], ['staff'], ['slots']].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  })

  const general = useMemo<StaffCommission | null>(() => {
    if (!form) return null
    const overrides = Object.fromEntries(
      Object.entries(form.overrides)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [k, Number(v)]),
    )
    return {
      staffId: editing?.id ?? 'new',
      mode: form.mode,
      value: form.value === '' ? null : Number(form.value),
      overrides,
    }
  }, [form, editing?.id])

  const history = editing
    ? (team.commissionHistory ?? [])
        .filter((v) => v.staffId === editing.id)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
    : []
  if (!draft || !form) return null
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const scheduleProblems = Object.keys(scheduleErrors(form.schedule, business.hours.weekly)).length
  const digits = (s: string) => s.replace(/[^\d]/g, '')
  const unit = form.mode === 'percent' ? { suffix: '%' } : { prefix: '$' }

  const submit = () => {
    setError(null)
    setOutside(null)
    save.mutate(
      {
        id: editing?.id,
        name: form.name,
        title: form.title,
        photoUrl: form.photoUrl,
        active: form.active,
        schedule: form.schedule,
        serviceIds: form.serviceIds,
        commission:
          seesFinance && general
            ? { mode: general.mode, value: general.value, overrides: general.overrides }
            : undefined,
        commissionFrom: commissionFrom ?? weekFrom,
      },
      {
        onSuccess: ({ staff, outside: left }) => {
          toast(editing ? `${staff.name}: cambios guardados` : `${staff.name} agregado al equipo`)
          if (left.length) setOutside(left)
          else onClose()
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  const tabs: { value: Tab; label: string }[] = [
    { value: 'perfil', label: 'Perfil' },
    { value: 'horario', label: scheduleProblems ? 'Horario · revisar' : 'Horario' },
    { value: 'servicios', label: `Servicios (${form.serviceIds.length})` },
    ...(seesFinance ? [{ value: 'comision' as const, label: 'Comisión' }] : []),
    ...(editing ? [{ value: 'ausencias' as const, label: 'Ausencias' }] : []),
  ]

  return (
    <SidePanel
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={editing ? editing.name : 'Nuevo barbero'}
      description={
        canEdit
          ? editing
            ? 'Perfil, horario, servicios y comisión.'
            : 'Aparecerá en la reserva cuando esté activo.'
          : 'Solo lectura (salvo ausencias)'
      }
      footer={
        canEdit && tab !== 'ausencias' ? (
          <>
            <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              {outside ? 'Cerrar' : 'Cancelar'}
            </button>
            <button type="button" onClick={submit} disabled={save.isPending} className={buttonClass({ size: 'sm' })}>
              {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar barbero'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-5">
        {error && <Alert tone="danger" title={error} />}
        {outside && (
          <Alert
            tone="warning"
            title={`${outside.length} ${outside.length === 1 ? 'cita próxima queda' : 'citas próximas quedan'} fuera de su horario o servicios`}
          >
            <p>Siguen agendadas; muévelas o avísale al cliente:</p>
            <ul className="mt-2 grid gap-1">
              {outside.map((a) => (
                <li key={a.id}>
                  <Link
                    to={routes.adminAgenda({ fecha: localDate(a.startsAt, tz), cita: a.id })}
                    className="underline underline-offset-2"
                  >
                    {capitalize(formatDay(localDate(a.startsAt, tz), "EEE d 'de' MMM"))},{' '}
                    {formatTime12(localTime(a.startsAt, tz))} · {a.customer.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <Tabs<Tab> label="Secciones del barbero" idBase={idBase} value={tab} onChange={setTab} tabs={tabs} />

        <TabPanel idBase={idBase} value={tab}>
          {tab === 'perfil' && (
            <fieldset disabled={!canEdit} className="grid gap-5">
              <ImageUploader
                label="Foto"
                value={form.photoUrl}
                onChange={(photoUrl) => set({ photoUrl })}
                onUpload={(blob) => repo.uploadStaffPhoto(blob)}
                disabled={!canEdit}
              />
              <Input label="Nombre" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              <Input
                label="Título"
                hint="Opcional, por ejemplo «Barbero senior»."
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
              />
              <div className="rounded-md border border-line p-4">
                <Switch
                  label="Activo"
                  description="Aparece en la reserva y se le pueden agendar citas."
                  checked={form.active}
                  disabled={!canEdit}
                  onChange={(active) => set({ active })}
                />
              </div>
              <p className="text-[13px] text-fg-muted">
                El acceso al panel de cada barbero se da en Ajustes › Usuarios.
              </p>
            </fieldset>
          )}

          {tab === 'horario' && (
            <div className="grid gap-3">
              <p className="text-[13px] text-fg-muted">
                De aquí sale su disponibilidad en la reserva. Para la comida, divide el día en dos turnos.
              </p>
              <ScheduleEditor
                value={form.schedule}
                onChange={(schedule) => set({ schedule })}
                shop={business.hours.weekly}
                disabled={!canEdit}
              />
            </div>
          )}

          {tab === 'servicios' && (
            <div className="grid gap-4">
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => set({ serviceIds: services.map((s) => s.id) })}
                    className={buttonClass({ variant: 'secondary', size: 'sm' })}
                  >
                    Activar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ serviceIds: [] })}
                    className={buttonClass({ variant: 'ghost', size: 'sm' })}
                  >
                    Desactivar todos
                  </button>
                </div>
              )}
              {categories.map((c) => {
                const list = services.filter((s) => s.categoryId === c.id)
                if (!list.length) return null
                return (
                  <section key={c.id} className="grid gap-2">
                    <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{c.name}</h3>
                    <ul className="divide-y divide-line rounded-md border border-line">
                      {list.map((s) => {
                        const on = form.serviceIds.includes(s.id)
                        return (
                          <li key={s.id} className={cn('px-4 py-3', !on && 'bg-surface')}>
                            <Switch
                              label={s.name}
                              description={`${durationLabel(s.durationMin)} · ${money(s.price)}${s.active ? '' : ' · oculto en el sitio'}`}
                              checked={on}
                              disabled={!canEdit}
                              onChange={(v) =>
                                set({
                                  serviceIds: v
                                    ? [...form.serviceIds, s.id]
                                    : form.serviceIds.filter((x) => x !== s.id),
                                })
                              }
                            />
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}

          {tab === 'comision' && seesFinance && general && (
            <div className="grid gap-5">
              {editing && (
                <div className="grid gap-3 rounded-lg border border-line p-4">
                  <Select
                    label="Si cambias la comisión, aplica desde"
                    value={commissionFrom ?? weekFrom}
                    onValueChange={setCommissionFrom}
                    options={[
                      {
                        value: weekFrom,
                        label: `Esta semana de nómina (desde el ${formatDay(weekFrom, "EEE d 'de' MMM")})`,
                      },
                      ...(todayLocal !== weekFrom
                        ? [{ value: todayLocal, label: `Hoy (${formatDay(todayLocal, "EEE d 'de' MMM")})` }]
                        : []),
                      {
                        value: addDays(weekFrom, 7),
                        label: `La próxima semana (desde el ${formatDay(addDays(weekFrom, 7), "EEE d 'de' MMM")})`,
                      },
                    ]}
                    hint="Las semanas anteriores conservan la comisión que tenían."
                  />
                  {history.length > 0 && (
                    <ul className="grid gap-1 text-[13px]" aria-label="Historial de comisión">
                      {history.map((v) => (
                        <li key={v.validFrom} className="flex justify-between gap-3">
                          <span className="text-fg-muted">
                            {v.validFrom < '1000' ? 'Antes' : `Desde ${formatDay(v.validFrom, "d 'de' MMM yyyy")}`}
                          </span>
                          <span>{commissionLabel(v)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className="text-[13px] text-fg-muted">
                Solo la ven dueño y gerente. Las comisiones de productos se capturan en cada producto.
              </p>
              <div className="grid gap-3 rounded-lg border border-line p-4">
                <Segmented<StaffCommission['mode']>
                  label="Tipo de comisión"
                  value={form.mode}
                  onChange={(mode) => set({ mode })}
                  options={[
                    { value: 'percent', label: '% del servicio' },
                    { value: 'fixed', label: 'Monto fijo' },
                  ]}
                  className="max-w-full justify-self-start overflow-x-auto"
                />
                <div className="w-48">
                  <Input
                    label={form.mode === 'percent' ? 'Porcentaje general' : 'Monto general'}
                    inputMode="numeric"
                    placeholder="Sin capturar"
                    value={form.value}
                    onChange={(e) => set({ value: digits(e.target.value) })}
                    {...unit}
                  />
                </div>
              </div>
              <section className="grid gap-2">
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                  Por servicio (deja vacío para usar la general)
                </h3>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {services
                    .filter((s) => form.serviceIds.includes(s.id))
                    .map((s) => {
                      const earn = commissionOn(s, general)
                      return (
                        <li
                          key={s.id}
                          className="grid grid-cols-[minmax(0,1fr)_88px_72px] items-center gap-2 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_120px_96px] sm:gap-3 sm:px-4"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{s.name}</span>
                            <span className="text-[13px] text-fg-muted">{money(s.price)}</span>
                          </span>
                          <Input
                            label={`Comisión en ${s.name}`}
                            hideLabel
                            inputMode="numeric"
                            placeholder={form.value || '—'}
                            value={form.overrides[s.id] ?? ''}
                            onChange={(e) => set({ overrides: { ...form.overrides, [s.id]: digits(e.target.value) } })}
                            {...unit}
                          />
                          <span className="tabular text-right text-sm">
                            {earn === null ? <span className="text-fg-muted">—</span> : money(earn)}
                            {form.overrides[s.id] && (
                              <Badge className="ml-1.5" tone="accent">
                                propia
                              </Badge>
                            )}
                          </span>
                        </li>
                      )
                    })}
                </ul>
                <p className="text-[13px] text-fg-muted">La última columna es lo que gana por cada servicio.</p>
              </section>
            </div>
          )}

          {tab === 'ausencias' && editing && <Absences staff={editing} team={team} />}
        </TabPanel>
      </div>
    </SidePanel>
  )
}
