import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mail, MessageCircle } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { routes } from '@/app/routes'
import type { Staff } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import type { InviteResult } from '../domain'
import { Segmented } from '../ui/controls'
import { useToast } from '../ui/Toast'
import type { CustomerSummary } from './model'
import { leftToday, whatsappText, whatsappUrl, winbackRows, type InviteKind, type WinbackRow } from './winback'

const siteUrl = () => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`

const ago = (days: number) => (days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`)

/**
 * Clientes › Por recuperar: who hasn't come back in a while (or was imported and
 * hasn't visited yet), with buttons to invite them by e-mail or WhatsApp.
 */
export function WinbackView({
  list,
  staff,
  onOpen,
}: {
  list: CustomerSummary[] | undefined
  staff: Staff[]
  onOpen: (id: string) => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [segment, setSegment] = useState<InviteKind>('winback')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<InviteResult | null>(null)
  const { data: state, error } = useQuery({ queryKey: ['admin', 'invites'], queryFn: () => repo.getInviteState() })
  const now = useMemo(() => new Date(), [])

  const rows = useMemo(
    () => (list && state ? winbackRows(list, state, segment, now) : undefined),
    [list, state, segment, now],
  )
  const counts = useMemo(
    () =>
      list && state
        ? {
            winback: winbackRows(list, state, 'winback', now).length,
            new_system: winbackRows(list, state, 'new_system', now).length,
          }
        : null,
    [list, state, now],
  )
  const left = state ? leftToday(state) : 0
  const emailable = rows?.filter((r) => r.canEmail) ?? []

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
  const send = useMutation({
    mutationFn: (ids: string[]) => repo.inviteCustomers(ids, segment),
    onSuccess: async (r) => {
      setResult(r)
      setSelected(new Set())
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['admin', 'email-settings'] })])
      toast(
        r.queued
          ? `${r.queued} ${r.queued === 1 ? 'invitación enviada' : 'invitaciones enviadas'}`
          : 'No se envió ninguna invitación',
      )
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const logWhatsapp = useMutation({
    mutationFn: (id: string) => repo.logWhatsappInvite(id, segment),
    onSuccess: refresh,
  })

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else if (next.size < left) next.add(id)
      return next
    })

  if (error)
    return (
      <Alert tone="danger" title="No se pudo cargar la lista">
        {errorMessage(error)}
      </Alert>
    )
  if (!rows || !state || !counts) return <Skeleton className="h-72 rounded-lg" aria-busy="true" />

  const name = (id: string) => (r: WinbackRow) => r.summary.customer.id === id
  const barberOf = (r: WinbackRow) => staff.find((s) => s.id === r.summary.favoriteStaffId && s.active) ?? null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<InviteKind>
          label="Lista"
          value={segment}
          onChange={(v) => {
            setSegment(v)
            setSelected(new Set())
            setResult(null)
          }}
          className="max-w-full overflow-x-auto"
          options={[
            { value: 'winback', label: `Sin venir +${state.days} días`, count: counts.winback },
            { value: 'new_system', label: 'Importados sin visita', count: counts.new_system },
          ]}
        />
        <p className="text-[13px] text-fg-muted">
          Hoy puedes enviar <strong className="tabular font-semibold text-fg">{left}</strong> invitaciones por correo
          más (límite {state.dailyLimit}).{' '}
          <Link to={`${routes.adminSection('ajustes')}?vista=correos`} className="underline underline-offset-4">
            Cambiar
          </Link>
        </p>
      </div>

      <p className="text-sm text-fg-muted">
        {segment === 'winback'
          ? `Clientes cuya última visita fue hace más de ${state.days} días y no tienen cita. Primero los más frecuentes y los más cerca del corte gratis.`
          : 'Clientes traídos de AgendaPro que todavía no vienen con el sistema nuevo. La invitación les presenta la reserva en línea y la tarjeta de sellos.'}{' '}
        Cada cliente recibe una invitación cada 30 días como máximo.
      </p>

      {result && (result.queued > 0 || result.skipped.length > 0) && (
        <Alert tone={result.skipped.length ? 'warning' : 'success'} title={`Enviadas: ${result.queued}`}>
          {result.skipped.length > 0 && (
            <ul className="mt-1 grid gap-0.5">
              {result.skipped.map((s) => (
                <li key={s.id}>
                  {rows.find(name(s.id))?.summary.customer.name ??
                    list?.find((x) => x.customer.id === s.id)?.customer.name}
                  : {s.reason}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-sm text-fg-muted">
          {segment === 'winback'
            ? `Nadie lleva más de ${state.days} días sin venir. La lista se va llenando conforme se cobran visitas en el sistema.`
            : 'No quedan clientes importados por invitar.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!emailable.length || !left}
              onClick={() => setSelected(new Set(emailable.slice(0, left).map((r) => r.summary.customer.id)))}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Seleccionar {Math.min(left, emailable.length)} con correo
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className={buttonClass({ variant: 'ghost', size: 'sm' })}
              >
                Quitar selección
              </button>
            )}
            <button
              type="button"
              disabled={!selected.size || send.isPending}
              onClick={() => send.mutate([...selected])}
              className={buttonClass({ size: 'sm', className: 'sm:ml-auto' })}
            >
              <Mail className="size-4" aria-hidden />
              {send.isPending ? 'Enviando…' : `Invitar por correo (${selected.size})`}
            </button>
          </div>

          <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Clientes por recuperar">
            {rows.map((r) => {
              const c = r.summary.customer
              const barber = barberOf(r)
              const card = r.summary.loyalty
              const checked = selected.has(c.id)
              const wa = whatsappText(r, segment, {
                site: siteUrl(),
                barberName: barber?.name.split(' ')[0] ?? null,
                barberId: barber?.id ?? null,
              })
              return (
                <li
                  key={c.id}
                  className={cn(
                    'grid gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
                    checked && 'bg-fg/[0.03]',
                  )}
                >
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar a ${c.name}`}
                    checked={checked}
                    disabled={!r.canEmail || (!checked && selected.size >= left)}
                    onChange={() => toggle(c.id)}
                    className="hidden size-5 accent-ink-950 disabled:opacity-30 sm:block"
                  />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      className="truncate text-left font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {c.name}
                    </button>
                    <p className="text-[13px] text-fg-muted">
                      {r.daysAway !== null ? `Última visita ${ago(r.daysAway)}` : 'Sin visitas en el sistema nuevo'}
                      {r.summary.visits > 0 &&
                        ` · ${r.summary.visits} ${r.summary.visits === 1 ? 'visita' : 'visitas'}`}
                      {card && ` · ${card.stamps}/${card.goal} sellos`}
                      {barber && ` · con ${barber.name.split(' ')[0]}`}
                    </p>
                    <p className="text-[13px] text-fg-muted">
                      {r.lastInvite
                        ? `Invitado por ${r.lastInvite.channel === 'email' ? 'correo' : 'WhatsApp'} ${ago(Math.floor((now.getTime() - Date.parse(r.lastInvite.at)) / 86400000))}`
                        : 'Sin invitar'}
                      {r.waitDays > 0 && ` · podrás invitarlo en ${r.waitDays} días`}
                      {!c.email && ' · sin correo'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!r.canEmail || !left || send.isPending}
                      onClick={() => send.mutate([c.id])}
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                      title={
                        !c.email ? 'Este cliente no tiene correo' : r.waitDays ? 'Ya se le invitó hace poco' : undefined
                      }
                    >
                      <Mail className="size-4" aria-hidden /> Correo
                    </button>
                    {r.canWhatsapp && (
                      <a
                        href={whatsappUrl(c.phone, wa)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => logWhatsapp.mutate(c.id)}
                        className={buttonClass({ variant: 'secondary', size: 'sm' })}
                      >
                        <MessageCircle className="size-4" aria-hidden /> WhatsApp
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
