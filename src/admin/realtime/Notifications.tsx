import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as RP from '@radix-ui/react-popover'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, BellRing, CalendarPlus, X } from 'lucide-react'
import { routes } from '@/app/routes'
import { useStaff } from '@/app/queries'
import { useNow } from '@/app/useNow'
import { buttonClass } from '@/components/ui/buttonClass'
import { business } from '@/config/business'
import type { Appointment, Staff } from '@/domain/types'
import { cn } from '@/lib/cn'
import { capitalize, formatDay, formatTime12, localDate, localTime } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { useToast } from '../ui/Toast'

interface Notice {
  id: string
  appointment: Appointment
  at: number
  read: boolean
}

interface Ctx {
  notices: Notice[]
  unread: number
  markAllRead(): void
  markRead(id: string): void
  /** Hide the floating cards (they are already in the bell's list). */
  clearPopups(): void
}

const NotificationsCtx = createContext<Ctx | null>(null)
const POPUP_MS = 12_000
const tz = business.hours.timeZone

const when = (a: Appointment) =>
  `${capitalize(formatDay(localDate(a.startsAt, tz), "EEE d 'de' MMM"))}, ${formatTime12(localTime(a.startsAt, tz))}`
const barberName = (staff: Staff[] | undefined, id: string) => staff?.find((s) => s.id === id)?.name.split(' ')[0] ?? ''
const linkTo = (a: Appointment) => routes.adminAgenda({ fecha: localDate(a.startsAt, tz), cita: a.id })

/** Shown while the person is on another tab (only after they allowed it). */
function browserNotify(a: Appointment, barber: string, onClick: () => void) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  const n = new Notification('Nueva cita en línea · Havana Barbería', {
    body: `${a.customer.name} · ${when(a)}${barber ? ` con ${barber}` : ''}`,
    tag: a.id,
  })
  n.onclick = () => {
    window.focus()
    onClick()
    n.close()
  }
}

/** One floating card per new booking; pauses while hovered or focused. */
function Popup({
  a,
  staff,
  onClose,
  onOpen,
}: {
  a: Appointment
  staff: Staff[] | undefined
  onClose: () => void
  onOpen: () => void
}) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(onClose, POPUP_MS)
    return () => clearTimeout(t)
  }, [paused, onClose])
  const barber = barberName(staff, a.staffId)
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-[min(380px,calc(100vw-32px))] animate-[rise_220ms_ease-out] gap-3 rounded-lg border border-line bg-raised p-4 text-fg shadow-lg"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-ink-950 text-aqua-400">
        <BellRing className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Nueva cita en línea</p>
        <p className="mt-0.5 truncate text-sm">{a.customer.name}</p>
        <p className="text-[13px] text-fg-muted">
          {when(a)}
          {barber ? ` con ${barber}` : ''}
        </p>
        <button type="button" onClick={onOpen} className={buttonClass({ size: 'sm', className: 'mt-3' })}>
          Ver cita
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="-mr-1.5 -mt-1.5 grid size-9 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}

/**
 * Live updates for the whole panel. Every change refreshes the agenda and the
 * overview at once (no reload); each new online booking pops a card anywhere in
 * the panel, lands in the bell's list and, if allowed, shows a browser
 * notification while the panel is in the background. A barber only hears about
 * their own appointments.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: staff } = useStaff()
  const [notices, setNotices] = useState<Notice[]>([])
  const [popups, setPopups] = useState<Appointment[]>([])
  const staffRef = useRef(staff)
  staffRef.current = staff

  useEffect(
    () =>
      repo.subscribe((change) => {
        void qc.invalidateQueries({ queryKey: ['admin'] })
        const fresh = change.created.filter(
          (a) => (a.source ?? 'online') === 'online' && (user.role !== 'barber' || a.staffId === user.staffId),
        )
        if (!fresh.length) return
        const at = Date.now()
        setNotices((ns) => [...fresh.map((a) => ({ id: a.id, appointment: a, at, read: false })), ...ns].slice(0, 30))
        setPopups((ps) => [...ps, ...fresh].slice(-3))
        for (const a of fresh) browserNotify(a, barberName(staffRef.current, a.staffId), () => navigate(linkTo(a)))
      }),
    [repo, qc, user.role, user.staffId, navigate],
  )

  const markRead = useCallback(
    (id: string) => setNotices((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n))),
    [],
  )
  const markAllRead = useCallback(() => setNotices((ns) => ns.map((n) => ({ ...n, read: true }))), [])
  const clearPopups = useCallback(() => setPopups([]), [])
  const value = useMemo(
    () => ({ notices, unread: notices.filter((n) => !n.read).length, markAllRead, markRead, clearPopups }),
    [notices, markAllRead, markRead, clearPopups],
  )

  return (
    <NotificationsCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Avisos nuevos"
        role="region"
        className="pointer-events-none fixed right-4 top-20 z-toast grid gap-3 md:right-6"
      >
        {popups.map((a) => (
          <Popup
            key={a.id}
            a={a}
            staff={staff}
            onClose={() => setPopups((ps) => ps.filter((p) => p.id !== a.id))}
            onOpen={() => {
              setPopups((ps) => ps.filter((p) => p.id !== a.id))
              markRead(a.id)
              navigate(linkTo(a))
            }}
          />
        ))}
      </div>
    </NotificationsCtx.Provider>
  )
}

function useNotifications() {
  const v = useContext(NotificationsCtx)
  if (!v) throw new Error('NotificationsProvider is missing')
  return v
}

const ago = (at: number, now: number) => {
  const min = Math.floor((now - at) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  return `hace ${Math.floor(min / 60)} h`
}

/** Bell in the top bar: unread count, recent bookings, browser alerts and (demo) a simulated booking. */
export function NotificationBell() {
  const { notices, unread, markAllRead, markRead, clearPopups } = useNotifications()
  const { repo } = useAdminAuth()
  const { data: staff } = useStaff()
  const toast = useToast()
  const now = useNow(30_000).getTime()
  const [open, setOpen] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const supported = typeof Notification !== 'undefined'
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied')

  return (
    <RP.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) clearPopups()
      }}
    >
      <RP.Trigger
        aria-label={unread ? `Avisos, ${unread} sin leer` : 'Avisos'}
        className="relative grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus coarse:size-tap"
      >
        <Bell className="size-5" strokeWidth={1.75} aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="tabular absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink-950 px-1 text-[11px] font-semibold text-white ring-2 ring-raised"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </RP.Trigger>
      <RP.Portal>
        <RP.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-dropdown w-[min(380px,calc(100vw-24px))] rounded-lg border border-line bg-raised text-fg shadow-lg data-[state=open]:animate-[fade-in_150ms_ease-out]"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Avisos</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded text-[13px] font-medium text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                Marcar como leídos
              </button>
            )}
          </div>

          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              Sin avisos por ahora. Aquí aparecen las citas que entran en línea.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {notices.map((n) => {
                const a = n.appointment
                const barber = barberName(staff, a.staffId)
                return (
                  <li key={n.id}>
                    <Link
                      to={linkTo(a)}
                      onClick={() => {
                        markRead(n.id)
                        setOpen(false)
                      }}
                      className="flex gap-3 px-4 py-3 hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                    >
                      <span
                        aria-hidden
                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-ink-950')}
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate font-semibold">{a.customer.name}</span>
                        <span className="block text-fg-muted">
                          {when(a)}
                          {barber ? ` con ${barber}` : ''}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          Reservó en línea · {ago(n.at, now)}
                          {!n.read && <span className="sr-only"> (sin leer)</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="grid gap-2 border-t border-line px-4 py-3 text-[13px]">
            {supported &&
              (permission === 'granted' ? (
                <p className="text-fg-muted">Avisos del navegador activados (cuando el panel está en segundo plano).</p>
              ) : permission === 'denied' ? (
                <p className="text-fg-muted">
                  Los avisos del navegador están bloqueados en la configuración del sitio.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void Notification.requestPermission().then(setPermission)}
                  className="justify-self-start rounded font-medium underline decoration-line-strong underline-offset-4 hover:decoration-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Activar avisos del navegador
                </button>
              ))}
            {repo.demo && (
              <button
                type="button"
                disabled={simulating}
                onClick={() => {
                  setSimulating(true)
                  setOpen(false)
                  repo
                    .demo!.simulateOnlineBooking()
                    .catch((e: unknown) => toast(e instanceof Error ? e.message : 'No se pudo simular', 'danger'))
                    .finally(() => setSimulating(false))
                }}
                className="inline-flex items-center gap-1.5 justify-self-start rounded font-medium text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <CalendarPlus className="size-4" strokeWidth={1.75} aria-hidden />
                {simulating ? 'Simulando…' : 'Simular reserva en línea (demo)'}
              </button>
            )}
          </div>
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  )
}
