import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import type { SentEmail } from '../domain'
import { Input, Switch } from '../ui/controls'
import { Card } from '../ui/Panel'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'

const kindLabels: Record<SentEmail['kind'], string> = {
  confirmation: 'Confirmación',
  reschedule: 'Cambio de horario',
  cancellation: 'Cancelación',
  reminder_24h: 'Recordatorio un día antes',
  reminder_2h: 'Recordatorio dos horas antes',
  team_new: 'Aviso al barbero: nueva cita',
  team_cancel: 'Aviso al barbero: cancelación',
  thank_you: 'Gracias por tu visita',
  winback: 'Invitación: te extrañamos',
  new_system: 'Invitación: estrenamos reservas',
}

const statusLabels: Record<SentEmail['status'], [string, BadgeTone]> = {
  pending: ['En cola', 'info'],
  sending: ['Enviando', 'info'],
  sent: ['Enviado', 'success'],
  failed: ['Falló', 'danger'],
  skipped: ['Omitido', 'neutral'],
}

const at = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))

/** Ajustes › Correos: test mode for customer e-mails and what was sent lately. */
export function EmailsView() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data, error } = useQuery({
    queryKey: ['admin', 'email-settings'],
    queryFn: () => repo.getEmailSettings(),
    refetchInterval: 60_000,
  })
  const toggle = useMutation({
    mutationFn: (on: boolean) => repo.setCustomerEmails(on),
    onSuccess: async (_, on) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'email-settings'] })
      toast(on ? 'Los clientes ya reciben sus correos' : 'Correos en modo prueba')
    },
    onError: (e) => toast(errorMessage(e)),
  })

  if (error)
    return (
      <Alert tone="danger" title="No se pudieron cargar los correos">
        {errorMessage(error)}
      </Alert>
    )
  if (!data) return <Skeleton className="h-72 rounded-lg" aria-busy="true" />

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card
        title="Correos a clientes"
        description="Confirmación al agendar, aviso si cambia o se cancela, recordatorios un día y dos horas antes, y «Gracias por tu visita» al cobrar (con su ticket, sus sellos y el botón para dejar reseña en Google)."
      >
        <Switch
          checked={data.customerEmails}
          disabled={toggle.isPending}
          onChange={(on) => toggle.mutate(on)}
          label="Enviar correos a clientes"
          description={
            data.customerEmails
              ? 'Encendido: cada cliente con correo recibe los suyos (con copia oculta para revisión).'
              : 'Apagado (modo prueba): los correos a clientes llegan solo a la copia de revisión, marcados «Prueba». Enciéndelo cuando dejes AgendaPro para que nadie reciba correos dobles. Los avisos al equipo siempre se envían.'
          }
        />
      </Card>

      <TeamEmails saved={data.teamEmails} />

      <ReviewLink saved={data.googleReviewUrl} />

      <InviteSettings days={data.winbackDays} limit={data.inviteDailyLimit} />

      <Card title="Últimos correos" description="Se envían en el minuto siguiente a cada cambio.">
        {data.recent.length === 0 ? (
          <p className="text-sm text-fg-muted">Todavía no hay correos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent.map((e) => {
              const [label, tone] = statusLabels[e.status]
              return (
                <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.subject ?? kindLabels[e.kind]}</p>
                    <p className="truncate text-sm text-fg-muted">
                      {kindLabels[e.kind]}
                      {e.to ? ` · ${e.to}` : ''} · <span className="tabular-nums">{at(e.sentAt ?? e.createdAt)}</span>
                    </p>
                    {e.error && e.status !== 'sent' && <p className="text-sm text-fg-muted">{e.error}</p>}
                  </div>
                  <div>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

/** Besides the barber, who hears about each online booking and cancellation (e.g. the owner). */
function TeamEmails({ saved }: { saved: string[] }) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const text = draft ?? saved.join(', ')
  const save = useMutation({
    mutationFn: () => repo.setTeamEmails(text.split(/[\s,;]+/)),
    onSuccess: async () => {
      setDraft(null)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'email-settings'] })
      toast('Avisos al equipo guardados')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Card
      title="Avisos de citas en línea"
      description="Cada cita nueva o cancelada desde el sitio le llega al barbero de la cita (con el correo de su perfil en Equipo). Agrega aquí quién más debe recibirlas, por ejemplo el dueño."
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Input
          label="Correos que reciben todas las citas en línea"
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder="dueno@ejemplo.com, gerente@ejemplo.com"
          value={text}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          hint="Hasta 5, separados por coma."
        />
        {error && <Alert tone="danger" title={error} />}
        <button
          type="submit"
          disabled={draft === null || save.isPending}
          className={buttonClass({ size: 'sm', className: 'justify-self-start' })}
        >
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Card>
  )
}

/** The Google review link used by «Gracias por tu visita». */
function ReviewLink({ saved }: { saved: string }) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const value = draft ?? saved
  const save = useMutation({
    mutationFn: () => repo.setGoogleReviewUrl(value),
    onSuccess: async () => {
      setDraft(null)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'email-settings'] })
      toast('Enlace de reseñas guardado')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Card
      title="Reseñas en Google"
      description="El botón «Dejar mi reseña en Google» del correo de agradecimiento abre este enlace. Cópialo en tu Perfil de Negocio de Google › «Pedir reseñas»: lleva directo a las estrellas. Si lo dejas vacío, abre tu perfil en Google Maps."
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Input
          label="Enlace para pedir reseñas"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://g.page/r/…/review"
          value={value}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
        />
        {error && <Alert tone="danger" title={error} />}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={draft === null || save.isPending} className={buttonClass({ size: 'sm' })}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          {value && (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Probar enlace
            </a>
          )}
        </div>
      </form>
    </Card>
  )
}

/** Clientes › Por recuperar: when a customer counts as "away" and the daily e-mail cap. */
function InviteSettings({ days, limit }: { days: number; limit: number }) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<{ days: string; limit: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const f = form ?? { days: String(days), limit: String(limit) }
  const save = useMutation({
    mutationFn: () => repo.setInviteSettings({ winbackDays: Number(f.days), inviteDailyLimit: Number(f.limit) }),
    onSuccess: async () => {
      setForm(null)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast('Invitaciones guardadas')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <Card
      title="Invitaciones a volver"
      description="En Clientes › Por recuperar aparecen quienes no vienen hace más de estos días y no tienen cita. El límite diario cuida tu plan de correos (Resend gratuito: 100 correos al día contando confirmaciones y recordatorios)."
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Select
          label="Días sin venir"
          value={f.days}
          onValueChange={(v) => setForm({ ...f, days: v })}
          options={[30, 40, 45, 60, 90].map((d) => ({ value: String(d), label: `Más de ${d} días` }))}
        />
        <Input
          label="Invitaciones por correo al día"
          inputMode="numeric"
          value={f.limit}
          onChange={(e) => setForm({ ...f, limit: e.target.value.replace(/\D/g, '').slice(0, 2) })}
          hint="Recomendado: 30."
        />
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger" title={error} />
          </div>
        )}
        <button
          type="submit"
          disabled={form === null || save.isPending}
          className={buttonClass({ size: 'sm', className: 'justify-self-start' })}
        >
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </Card>
  )
}
