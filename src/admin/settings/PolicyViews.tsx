import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Scissors } from 'lucide-react'
import { routes } from '@/app/routes'
import { Alert } from '@/components/ui/Alert'
import type { BookingPolicy, Service, ServiceCategory } from '@/domain/types'
import { durationText, policyOptions, policySummary, type EditablePolicyKey } from '@/lib/policy'
import { durationLabel, money } from '@/lib/time'
import { Switch } from '../ui/controls'
import { Card } from '../ui/Panel'
import { Select } from '../ui/Select'

export interface PolicyForm {
  policy: BookingPolicy
  /** Services that earn a loyalty stamp. */
  eligible: string[]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** How each option reads in its dropdown. */
const optionLabel: Record<EditablePolicyKey, (n: number) => string> = {
  slotStepMin: (n) => (n === 60 ? 'Cada hora' : `Cada ${n} minutos`),
  minNoticeMin: (n) => `${durationText(n)} antes`,
  maxAdvanceDays: (n) => `${n} días`,
  maxActiveAppointmentsPerCustomer: (n) => plural(n, 'cita', 'citas'),
  bufferMin: (n) => (n === 0 ? 'Sin tiempo extra' : `${n} minutos`),
  changeCutoffMin: (n) => `${durationText(n)} antes`,
  toleranceMin: (n) => `${n} minutos`,
  loyaltyGoal: (n) => `${n} sellos`,
  rewardValidityDays: (n) => (n === 365 ? '1 año' : `${n} días`),
}

function Rule({
  k,
  label,
  hint,
  form,
  onChange,
  disabled,
}: {
  k: EditablePolicyKey
  label: string
  hint: ReactNode
  form: PolicyForm
  onChange: (f: PolicyForm) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-x-6 gap-y-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{hint}</p>
      </div>
      <Select
        label={label}
        hideLabel
        value={String(form.policy[k])}
        disabled={disabled}
        onValueChange={(v) => onChange({ ...form, policy: { ...form.policy, [k]: Number(v) } })}
        options={policyOptions[k].map((n) => ({ value: String(n), label: optionLabel[k](n) }))}
      />
    </div>
  )
}

function CustomerView({ text, children }: { text: string[]; children?: ReactNode }) {
  return (
    <aside
      className="grid content-start gap-3 self-start rounded-lg border border-line bg-surface p-5 text-sm xl:sticky xl:top-6"
      aria-label="Así lo lee el cliente"
    >
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Así lo lee el cliente</h2>
      {text.map((t) => (
        <p key={t} className="leading-relaxed">
          {t}
        </p>
      ))}
      {children}
      <Link
        to={routes.policies}
        target="_blank"
        className="inline-flex items-center gap-1.5 justify-self-start rounded text-[13px] font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        Ver políticas publicadas <ExternalLink className="size-3.5" aria-hidden />
      </Link>
    </aside>
  )
}

/** Booking rules: notice, how far ahead, limits, cleanup time, changes and tolerance. */
export function BookingRulesView({
  form,
  onChange,
  disabled,
}: {
  form: PolicyForm
  onChange: (f: PolicyForm) => void
  disabled?: boolean
}) {
  const s = policySummary(form.policy)
  const props = { form, onChange, disabled }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-6">
        <Card title="Reservas en línea" description="Lo que el cliente puede agendar desde el sitio.">
          <div className="divide-y divide-line">
            <Rule
              k="minNoticeMin"
              label="Anticipación mínima"
              hint="Qué tan pronto se puede reservar. Desde el panel puedes agendar sin mínimo."
              {...props}
            />
            <Rule
              k="maxAdvanceDays"
              label="Reservar con hasta"
              hint="Días hacia adelante que muestra el calendario."
              {...props}
            />
            <Rule
              k="maxActiveAppointmentsPerCustomer"
              label="Citas próximas por cliente"
              hint="Evita que una persona aparte muchos horarios a la vez."
              {...props}
            />
            <Rule
              k="bufferMin"
              label="Tiempo entre citas"
              hint="Minutos libres después de cada cita para limpiar y preparar."
              {...props}
            />
            <Rule
              k="slotStepMin"
              label="Horarios cada"
              hint="Cada cuánto ve horarios el cliente al reservar en línea, desde la apertura. En el panel siempre puedes agendar cada 15 minutos."
              {...props}
            />
          </div>
        </Card>
        <Card title="Cambios y puntualidad">
          <div className="divide-y divide-line">
            <Rule
              k="changeCutoffMin"
              label="Cancelar o reprogramar hasta"
              hint="Desde el enlace de su cita. Después de ese plazo, te llaman."
              {...props}
            />
            <Rule
              k="toleranceMin"
              label="Tolerancia"
              hint="Pasado este tiempo se puede marcar no-show y liberar el horario."
              {...props}
            />
          </div>
        </Card>
      </div>
      <CustomerView text={[s.reservas, s.cambios]} />
    </div>
  )
}

/** Loyalty: stamps for the free cut, how long it lasts, and which services earn a stamp. */
export function LoyaltyView({
  form,
  saved,
  onChange,
  services,
  categories,
  disabled,
}: {
  form: PolicyForm
  saved: BookingPolicy
  onChange: (f: PolicyForm) => void
  services: Service[]
  categories: ServiceCategory[]
  disabled?: boolean
}) {
  const props = { form, onChange, disabled }
  const goal = form.policy.loyaltyGoal
  const set = new Set(form.eligible)
  const toggle = (id: string, on: boolean) =>
    onChange({ ...form, eligible: on ? [...form.eligible, id] : form.eligible.filter((x) => x !== id) })
  const groups = categories
    .map((c) => ({ ...c, items: services.filter((s) => s.categoryId === c.id) }))
    .filter((g) => g.items.length)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-6">
        <Card title="Tarjeta de lealtad" description="El sello se gana al completar la cita.">
          <div className="divide-y divide-line">
            <Rule k="loyaltyGoal" label="Sellos para el corte gratis" hint="Al juntarlos ganan un corte." {...props} />
            <Rule
              k="rewardValidityDays"
              label="Vigencia del premio"
              hint="Desde que completan la tarjeta."
              {...props}
            />
          </div>
          {goal !== saved.loyaltyGoal && (
            <Alert tone="warning" title={`Pasarás de ${saved.loyaltyGoal} a ${goal} sellos`} className="mt-4">
              Las tarjetas en curso se ajustan a la nueva meta
              {goal < saved.loyaltyGoal ? `; quien ya tenga ${goal} o más gana su corte desde hoy` : ''}. Los premios ya
              ganados se respetan.
            </Alert>
          )}
        </Card>
        <Card
          title={`Servicios que suman sello (${set.size})`}
          description="Si una cita incluye al menos uno, suma un sello al completarla."
          bodyClassName="grid gap-5 p-5"
        >
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`lg-${g.id}`} className="grid gap-2">
              <h3 id={`lg-${g.id}`} className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                {g.name}
              </h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {g.items.map((s) => (
                  <li key={s.id} className="px-4 py-3">
                    <Switch
                      label={s.name}
                      description={`${durationLabel(s.durationMin)} · ${money(s.price)}`}
                      checked={set.has(s.id)}
                      disabled={disabled}
                      onChange={(on) => toggle(s.id, on)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Card>
      </div>
      <CustomerView text={[policySummary(form.policy).lealtad]}>
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {Array.from({ length: goal }, (_, i) => (
            <span
              key={i}
              className={
                i === goal - 1
                  ? 'grid size-7 place-items-center rounded-full bg-ink-950 text-white'
                  : 'size-7 rounded-full border-[1.5px] border-dashed border-line-strong'
              }
            >
              {i === goal - 1 ? <Scissors className="size-3.5" strokeWidth={2} /> : null}
            </span>
          ))}
        </div>
      </CustomerView>
    </div>
  )
}
