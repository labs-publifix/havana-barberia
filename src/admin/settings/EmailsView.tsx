import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import type { SentEmail } from '../domain'
import { Switch } from '../ui/controls'
import { Card } from '../ui/Panel'
import { useToast } from '../ui/Toast'

const kindLabels: Record<SentEmail['kind'], string> = {
  confirmation: 'Confirmación',
  reschedule: 'Cambio de horario',
  cancellation: 'Cancelación',
  reminder_24h: 'Recordatorio un día antes',
  reminder_2h: 'Recordatorio dos horas antes',
  team_new: 'Aviso al barbero: nueva cita',
  team_cancel: 'Aviso al barbero: cancelación',
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
        description="Confirmación al agendar, aviso si cambia o se cancela, y recordatorios un día y dos horas antes. Las citas de clientes sin cita no mandan correo."
      >
        <Switch
          checked={data.customerEmails}
          disabled={toggle.isPending}
          onChange={(on) => toggle.mutate(on)}
          label="Enviar correos a clientes"
          description={
            data.customerEmails
              ? 'Encendido: cada cliente con correo recibe los suyos (con copia oculta para revisión).'
              : 'Apagado (modo prueba): los correos llegan solo a la copia de revisión, marcados «Prueba». Enciéndelo cuando dejes AgendaPro para que nadie reciba correos dobles.'
          }
        />
      </Card>

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
