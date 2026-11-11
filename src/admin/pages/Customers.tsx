import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck2, Gift, UserPlus, Users } from 'lucide-react'
import { useCatalog, useStaff } from '@/app/queries'
import { Badge } from '@/components/ui/Badge'
import { business } from '@/config/business'
import { formatMxPhone } from '@/lib/phone'
import { capitalize, formatDay, formatTime12, localDate, localTime } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { CustomerPanel } from '../customers/CustomerPanel'
import {
  filterPredicates,
  hasReward,
  isRestricted,
  matchesQuery,
  type CustomerFilter,
  type CustomerSummary,
} from '../customers/model'
import { SearchInput, Segmented } from '../ui/controls'
import { TabPanel, Tabs } from '../ui/Tabs'
import { WinbackView } from '../customers/WinbackView'
import { DataTable, type Column } from '../ui/DataTable'
import { Card, PageHeader, StatCard } from '../ui/Panel'

const tz = business.hours.timeZone

/** "hoy", "ayer", "hace 5 días", or a date for anything older than a month. */
function since(at: string, now: Date) {
  // Calendar days in the shop's time zone (yesterday at 8 p.m. is "Ayer", not "Hoy").
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000
  const days = day(localDate(now, tz)) - day(localDate(at, tz))
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 31) return `Hace ${days} días`
  return capitalize(formatDay(localDate(at, tz), 'd MMM yyyy'))
}

/**
 * Clientes: quick search (name, phone or email), filters for the questions the
 * desk asks every day, and each customer's profile in a side panel (?cliente=id).
 * All rows render so sorting covers the whole list; with Supabase, paging moves to the server.
 */
export default function Customers() {
  const { repo } = useAdminAuth()
  const [params, setParams] = useSearchParams()
  const { data: list } = useQuery({ queryKey: ['admin', 'customers'], queryFn: () => repo.listCustomers() })
  const { data: staff } = useStaff()
  const { data: catalog } = useCatalog()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CustomerFilter>('all')
  const openId = params.get('cliente')
  const view = params.get('vista') === 'recuperar' ? 'recuperar' : 'todos'
  const idBase = useId().replace(/:/g, '')
  const now = new Date()

  const counts = useMemo(() => {
    const c = { all: 0, upcoming: 0, regulars: 0, no_shows: 0, reward: 0 } as Record<CustomerFilter, number>
    for (const s of list ?? []) for (const f of Object.keys(c) as CustomerFilter[]) if (filterPredicates[f](s)) c[f]++
    return c
  }, [list])

  const rows = useMemo(
    () => list?.filter((s) => filterPredicates[filter](s) && matchesQuery(s, query)),
    [list, filter, query],
  )
  const monthStart = `${localDate(now, tz).slice(0, 7)}-01`
  const newThisMonth = list?.filter((s) => localDate(s.customer.createdAt, tz) >= monthStart).length

  const open = (id: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (id) next.set('cliente', id)
        else next.delete('cliente')
        return next
      },
      { replace: true },
    )

  const columns: Column<CustomerSummary>[] = [
    {
      id: 'name',
      header: 'Cliente',
      primary: true,
      sortValue: (s) => s.customer.name,
      cell: (s) => s.customer.name,
    },
    {
      id: 'flags',
      header: 'Avisos',
      hideBelow: 'md',
      cell: (s) => (
        <span className="flex flex-wrap gap-1.5">
          {isRestricted(s) && <Badge tone="danger">{s.recentNoShows} no-shows</Badge>}
          {hasReward(s) && <Badge tone="success">Corte gratis</Badge>}
          {!isRestricted(s) && !hasReward(s) && <span className="text-fg-muted">—</span>}
        </span>
      ),
    },
    {
      id: 'phone',
      header: 'Teléfono',
      hideBelow: 'lg',
      cell: (s) => (
        <span className="tabular text-fg-muted">{s.customer.phone ? formatMxPhone(s.customer.phone) : '—'}</span>
      ),
    },
    {
      id: 'last',
      header: 'Última visita',
      sortValue: (s) => s.lastVisit ?? '',
      cell: (s) => (s.lastVisit ? since(s.lastVisit, now) : <span className="text-fg-muted">—</span>),
    },
    {
      id: 'next',
      header: 'Próxima cita',
      hideBelow: 'xl',
      sortValue: (s) => s.nextAppointment?.startsAt ?? '9999',
      cell: (s) =>
        s.nextAppointment ? (
          <span className="tabular">
            {capitalize(formatDay(localDate(s.nextAppointment.startsAt, tz), 'EEE d MMM'))},{' '}
            {formatTime12(localTime(s.nextAppointment.startsAt, tz))}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { id: 'visits', header: 'Visitas', align: 'right', sortValue: (s) => s.visits, cell: (s) => s.visits },
    {
      id: 'stamps',
      header: 'Sellos',
      align: 'right',
      hideBelow: 'md',
      sortValue: (s) => s.loyalty?.stamps ?? -1,
      cell: (s) => (s.loyalty ? `${s.loyalty.stamps}/${s.loyalty.goal}` : <span className="text-fg-muted">—</span>),
    },
  ]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader description="Busca por nombre, teléfono o correo. Abre a un cliente para ver su historial, su tarjeta de sellos y agendarle." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Clientes" value={list?.length ?? '—'} icon={Users} detail="Con al menos una cita" />
        <StatCard label="Nuevos este mes" value={newThisMonth ?? '—'} icon={UserPlus} />
        <StatCard label="Con cita próxima" value={list ? counts.upcoming : '—'} icon={CalendarCheck2} />
        <StatCard label="Corte gratis por canjear" value={list ? counts.reward : '—'} icon={Gift} />
      </div>

      <Tabs<'todos' | 'recuperar'>
        label="Vista de clientes"
        idBase={idBase}
        value={view}
        onChange={(v) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p)
              if (v === 'recuperar') next.set('vista', 'recuperar')
              else next.delete('vista')
              return next
            },
            { replace: true },
          )
        }
        tabs={[
          { value: 'todos', label: 'Todos los clientes' },
          { value: 'recuperar', label: 'Por recuperar' },
        ]}
      />

      <TabPanel idBase={idBase} value={view}>
        {view === 'recuperar' ? (
          <Card bodyClassName="p-5">
            <WinbackView list={list} staff={staff ?? []} onOpen={(id) => open(id)} />
          </Card>
        ) : (
          <Card bodyClassName="grid grid-cols-[minmax(0,1fr)] gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                label="Buscar cliente"
                placeholder="Nombre, teléfono o correo"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                }}
                className="w-full sm:w-80"
              />
              <Segmented<CustomerFilter>
                label="Filtrar clientes"
                value={filter}
                onChange={setFilter}
                className="max-w-full overflow-x-auto"
                options={[
                  { value: 'all', label: 'Todos', count: counts.all },
                  { value: 'upcoming', label: 'Con cita', count: counts.upcoming },
                  { value: 'regulars', label: 'Frecuentes', count: counts.regulars },
                  { value: 'no_shows', label: 'Con no-shows', count: counts.no_shows },
                  { value: 'reward', label: 'Corte gratis', count: counts.reward },
                ]}
              />
            </div>
            <DataTable
              caption="Clientes"
              columns={columns}
              rows={rows}
              rowKey={(s) => s.customer.id}
              onRowOpen={(s) => open(s.customer.id)}
              selectedKey={openId}
              initialSort={{ id: 'last', dir: 'desc' }}
              empty={query ? 'Nadie coincide con la búsqueda.' : 'No hay clientes en este filtro.'}
            />
            {rows && (
              <p className="text-[13px] text-fg-muted" aria-live="polite">
                {rows.length === 1 ? '1 cliente' : `${rows.length} clientes`}
              </p>
            )}
          </Card>
        )}
      </TabPanel>

      <CustomerPanel
        customerId={openId}
        staff={staff ?? []}
        services={catalog?.services ?? []}
        timeZone={tz}
        onClose={() => open(null)}
      />
    </div>
  )
}
