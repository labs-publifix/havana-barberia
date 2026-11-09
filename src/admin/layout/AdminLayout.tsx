import { useCallback, useEffect, useState } from 'react'
import * as RD from '@radix-ui/react-dialog'
import { Outlet, useMatch } from 'react-router-dom'
import { Menu, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import { useNow } from '@/app/useNow'
import { business } from '@/config/business'
import { SkipLink } from '@/features/site/SkipLink'
import { capitalize, formatTime12, localTime } from '@/lib/time'
import { cn } from '@/lib/cn'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { Kbd } from '../ui/controls'
import { Tip } from '../ui/Tooltip'
import { NotificationBell, NotificationsProvider } from '../realtime/Notifications'
import { NewAppointmentProvider, useNewAppointment } from '../agenda/NewAppointmentContext'
import { buttonClass } from '@/components/ui/buttonClass'
import { isSectionId, sectionLabel } from '../sections'
import { SidebarContent } from './Sidebar'
import { UserMenu } from './UserMenu'

function Clock() {
  const now = useNow(30_000)
  const tz = business.hours.timeZone
  const date = capitalize(formatInTimeZone(now, tz, "EEEE d 'de' MMMM", { locale: es }))
  return (
    <p className="tabular hidden whitespace-nowrap text-sm text-fg-muted md:block">
      {date} · <span className="font-semibold text-fg">{formatTime12(localTime(now, tz))}</span>
    </p>
  )
}

/**
 * Always-visible "Agendar cita" for calls and WhatsApp messages: opens the
 * booking panel on any screen ("N" does the same). Barbers do not book.
 */
function BookButton() {
  const { user } = useAdminSession()
  const { repo } = useAdminAuth()
  const booking = useNewAppointment()
  // Data sources still connecting the agenda don't offer booking yet.
  const off = user.role === 'barber' || (!!repo.available && !repo.available.includes('agenda'))

  useEffect(() => {
    if (off) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable], [role="listbox"], [role="menu"]')) return
      // Not while a panel, dialog or popover is open.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      e.preventDefault()
      booking.open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [off, booking])

  if (off) return null
  return (
    <button
      type="button"
      onClick={() => booking.open()}
      aria-keyshortcuts="N"
      className={buttonClass({ size: 'sm', className: 'shrink-0 max-sm:w-10 max-sm:px-0' })}
    >
      <Plus className="size-4" strokeWidth={2} aria-hidden />
      <span className="max-sm:sr-only">Agendar cita</span>
      <span className="hidden coarse:hidden xl:inline-grid">
        <Kbd>N</Kbd>
      </span>
    </button>
  )
}

const SIDEBAR_KEY = 'havana:admin-sidebar'

/** Collapsed or expanded sidebar, remembered in this browser (a per-person convenience). */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, c ? 'expanded' : 'collapsed')
      } catch {
        /* storage blocked: still works for this visit */
      }
      return !c
    })
  }, [])
  return [collapsed, toggle] as const
}

/**
 * Admin shell. Desktop first (a large screen at the shop): fixed sidebar from
 * 1024px that collapses to an icon rail to give the content more room (button
 * in the top bar or the "[" key); below 1024px the same navigation opens as a drawer.
 */
export function AdminLayout() {
  const { user } = useAdminSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return
      if (el.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      e.preventDefault()
      toggleCollapsed()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])
  const section = useMatch('/admin/:section')?.params.section
  const title = isSectionId(section) ? sectionLabel(section, user.role) : 'Panel'

  return (
    <NotificationsProvider>
      <NewAppointmentProvider>
        <div className="min-h-dvh bg-surface text-fg">
          <SkipLink />
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-sticky hidden transition-[width] duration-base ease-brand lg:block',
              collapsed ? 'w-[72px]' : 'w-60 2xl:w-64',
            )}
          >
            <SidebarContent collapsed={collapsed} />
          </aside>

          <RD.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <RD.Portal>
              <RD.Overlay className="fixed inset-0 z-overlay bg-ink-950/50 data-[state=open]:animate-[fade-in_200ms_ease-out] lg:hidden" />
              <RD.Content className="fixed inset-y-0 left-0 z-modal w-[min(288px,85vw)] shadow-lg outline-none data-[state=open]:animate-[drawer-in_240ms_cubic-bezier(.2,.8,.2,1)] lg:hidden">
                <RD.Title className="sr-only">Menú del panel</RD.Title>
                <RD.Description className="sr-only">Secciones disponibles para tu rol</RD.Description>
                <SidebarContent onNavigate={() => setMenuOpen(false)} />
              </RD.Content>
            </RD.Portal>
          </RD.Root>

          <div
            className={cn(
              'transition-[padding] duration-base ease-brand',
              collapsed ? 'lg:pl-[72px]' : 'lg:pl-60 2xl:pl-64',
            )}
          >
            <header className="sticky top-0 z-sticky flex h-16 items-center gap-3 border-b border-line bg-raised px-4 md:px-6 lg:px-8">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Abrir menú"
                className="-ml-2 grid size-tap shrink-0 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
              >
                <Menu className="size-5" strokeWidth={1.75} />
              </button>
              <Tip
                content={
                  <>
                    {collapsed ? 'Expandir menú' : 'Contraer menú'} <Kbd>[</Kbd>
                  </>
                }
                side="bottom"
              >
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
                  aria-keyshortcuts="["
                  className="-ml-2 hidden size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus lg:grid"
                >
                  {collapsed ? (
                    <PanelLeftOpen className="size-5" strokeWidth={1.75} />
                  ) : (
                    <PanelLeftClose className="size-5" strokeWidth={1.75} />
                  )}
                </button>
              </Tip>
              <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.015em] md:text-xl">{title}</h1>
              <Clock />
              <BookButton />
              <NotificationBell />
              <span aria-hidden className="hidden h-6 w-px bg-line md:block" />
              <UserMenu />
            </header>
            <main id="contenido" tabIndex={-1} className="px-4 py-6 outline-none md:px-6 lg:px-8 lg:py-8">
              <Outlet />
            </main>
          </div>
        </div>
      </NewAppointmentProvider>
    </NotificationsProvider>
  )
}
