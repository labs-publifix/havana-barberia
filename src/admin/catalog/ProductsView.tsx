import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Package, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import type { Product } from '@/domain/types'
import { cn } from '@/lib/cn'
import { money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { fold } from '../customers/model'
import { SearchInput, Segmented } from '../ui/controls'
import { DataTable, type Column } from '../ui/DataTable'
import { Card, PageHeader } from '../ui/Panel'
import { ProductPanel, type ProductDraft } from './ProductPanel'
import { productMargin } from './products'

type Availability = 'all' | 'active' | 'inactive'

function Thumb({ p }: { p: Product }) {
  return p.imageUrl ? (
    <img src={p.imageUrl} alt="" width={40} height={40} className="size-10 rounded-md object-cover" loading="lazy" />
  ) : (
    <span aria-hidden className="grid size-10 place-items-center rounded-md bg-fg/[0.06] text-fg-muted">
      <Package className="size-5" strokeWidth={1.5} />
    </span>
  )
}

const missing = <span className="text-[13px] text-fg-muted">Sin capturar</span>

/**
 * Products sold at the shop. Everyone at the desk sees name, photo and public
 * price; cost, commission and margin only show to owner and manager.
 */
export function ProductsView() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const canEdit = user.role === 'owner' || user.role === 'manager'
  const seesFinance = canEdit
  const { data: products } = useQuery({ queryKey: ['admin', 'products'], queryFn: () => repo.listProducts() })
  const [query, setQuery] = useState('')
  const [availability, setAvailability] = useState<Availability>('all')
  const [draft, setDraft] = useState<ProductDraft | null>(null)

  const counts = useMemo(
    () => ({
      all: products?.length ?? 0,
      active: products?.filter((p) => p.active).length ?? 0,
      inactive: products?.filter((p) => !p.active).length ?? 0,
    }),
    [products],
  )
  const missingFinance = products?.filter((p) => p.cost === null || p.commission === null).length ?? 0
  const rows = products?.filter(
    (p) =>
      (availability === 'all' || (availability === 'active' ? p.active : !p.active)) &&
      (!query.trim() || fold(`${p.name} ${p.brand}`).includes(fold(query.trim()))),
  )

  const columns: Column<Product>[] = [
    { id: 'photo', header: 'Foto', cell: (p) => <Thumb p={p} /> },
    {
      id: 'name',
      header: 'Producto',
      primary: true,
      sortValue: (p) => p.name,
      cell: (p) => (
        <span className="block">
          <span className={cn('block', !p.active && 'text-fg-muted')}>{p.name}</span>
          {p.brand && <span className="block text-[13px] font-normal text-fg-muted">{p.brand}</span>}
        </span>
      ),
    },
    { id: 'price', header: 'Precio', align: 'right', sortValue: (p) => p.price, cell: (p) => money(p.price) },
    ...(seesFinance
      ? ([
          {
            id: 'cost',
            header: 'Costo',
            align: 'right',
            hideBelow: 'md',
            sortValue: (p) => p.cost ?? -1,
            cell: (p) => (p.cost === null ? missing : money(p.cost)),
          },
          {
            id: 'commission',
            header: 'Comisión',
            align: 'right',
            hideBelow: 'lg',
            sortValue: (p) => p.commission ?? -1,
            cell: (p) => (p.commission === null ? missing : money(p.commission)),
          },
          {
            id: 'margin',
            header: 'Margen',
            align: 'right',
            hideBelow: 'md',
            sortValue: (p) => productMargin(p).amount,
            cell: (p) => {
              const m = productMargin(p)
              if (!m.complete) return missing
              return (
                <span className={cn('font-semibold', m.amount < 0 && 'text-fg-danger')}>
                  {money(m.amount)}
                  {m.pct !== null && <span className="ml-1 text-[13px] font-normal text-fg-muted">{m.pct}%</span>}
                </span>
              )
            },
          },
        ] satisfies Column<Product>[])
      : []),
    {
      id: 'status',
      header: 'Estado',
      hideBelow: 'md',
      cell: (p) => (p.active ? <Badge tone="success">Disponible</Badge> : <Badge>No disponible</Badge>),
    },
  ]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description={
          seesFinance
            ? 'Productos que se venden en la barbería. El costo, la comisión y el margen solo los ven dueño y gerente.'
            : 'Productos que se venden en la barbería, con su precio al público.'
        }
        actions={
          canEdit ? (
            <button type="button" onClick={() => setDraft({ mode: 'new' })} className={buttonClass({ size: 'sm' })}>
              <Plus className="size-4" strokeWidth={2} aria-hidden /> Nuevo producto
            </button>
          ) : (
            <Badge>Solo lectura</Badge>
          )
        }
      />

      {seesFinance && missingFinance > 0 && (
        <p className="rounded-md border border-line bg-raised px-4 py-3 text-sm">
          <strong className="font-semibold">
            {missingFinance} {missingFinance === 1 ? 'producto' : 'productos'}
          </strong>{' '}
          sin costo o comisión capturados. Ábrelos para completar el margen.
        </p>
      )}

      <Card bodyClassName="grid grid-cols-[minmax(0,1fr)] gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            label="Buscar producto"
            placeholder="Buscar producto o marca"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-72"
          />
          <Segmented<Availability>
            label="Mostrar productos"
            value={availability}
            onChange={setAvailability}
            options={[
              { value: 'all', label: 'Todos', count: counts.all },
              { value: 'active', label: 'Disponibles', count: counts.active },
              { value: 'inactive', label: 'No disponibles', count: counts.inactive },
            ]}
          />
        </div>
        <DataTable
          caption="Productos"
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          onRowOpen={(p) => setDraft({ mode: 'edit', product: p })}
          selectedKey={draft?.mode === 'edit' ? draft.product.id : null}
          initialSort={{ id: 'name', dir: 'asc' }}
          empty={query ? 'Ningún producto coincide.' : 'Aún no hay productos. Crea el primero.'}
        />
      </Card>

      <ProductPanel draft={draft} canEdit={canEdit} seesFinance={seesFinance} onClose={() => setDraft(null)} />
    </div>
  )
}
