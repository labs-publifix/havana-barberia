import { useId, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronRight, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/booking/Avatar'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Service, ServiceCategory } from '@/domain/types'
import { cn } from '@/lib/cn'
import { durationLabel, money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { CategoryDialog, type CategoryDraft } from '../catalog/CategoryDialog'
import { ServicePanel, type ServiceDraft } from '../catalog/ServicePanel'
import { useCatalogActions } from '../catalog/useCatalogActions'
import { ProductsView } from '../catalog/ProductsView'
import { TabPanel, Tabs } from '../ui/Tabs'
import { fold } from '../customers/model'
import { errorMessage } from '../agenda/useAgendaActions'
import { SearchInput, Segmented } from '../ui/controls'
import { Card, EmptyState, PageHeader } from '../ui/Panel'
import { useToast } from '../ui/Toast'
import { Tip } from '../ui/Tooltip'
import { isFinanceRole } from '../domain'

type Visibility = 'all' | 'active' | 'hidden'

const iconBtn = cn(
  'grid size-8 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg coarse:size-tap',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-30',
)

/**
 * Servicios y precios: everything the public site and the booking flow offer
 * comes from here. Services grouped by category in the order customers see
 * them; owner and manager can create, edit, hide and reorder; reception reads.
 */
function ServicesView() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const canEdit = isFinanceRole(user.role)
  const toast = useToast()
  const { moveService, moveCategory, deleteCategory } = useCatalogActions()
  const { data: catalog } = useQuery({ queryKey: ['admin', 'catalog'], queryFn: () => repo.getCatalog() })
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)

  const counts = useMemo(() => {
    const all = catalog?.services ?? []
    return { all: all.length, active: all.filter((s) => s.active).length, hidden: all.filter((s) => !s.active).length }
  }, [catalog])

  const matches = (s: Service) =>
    (visibility === 'all' || (visibility === 'active' ? s.active : !s.active)) &&
    (!query.trim() || fold(`${s.name} ${s.description}`).includes(fold(query.trim())))
  const filtering = visibility !== 'all' || !!query.trim()

  const run = (p: Promise<unknown>) => p.catch((e: unknown) => toast(errorMessage(e), 'danger'))

  if (!catalog) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    )
  }

  const staffName = (id: string) => catalog.staff.find((s) => s.id === id)
  const visibleCategories = catalog.categories
    .map((c) => ({ category: c, services: catalog.services.filter((s) => s.categoryId === c.id) }))
    .filter((g) => !filtering || g.services.some(matches))

  const categoryActions = (c: ServiceCategory, i: number, count: number) =>
    canEdit && !filtering ? (
      <div className="flex items-center gap-0.5">
        <Tip content="Subir categoría">
          <button
            type="button"
            className={iconBtn}
            aria-label={`Subir ${c.name}`}
            disabled={i === 0 || moveCategory.isPending}
            onClick={() => run(moveCategory.mutateAsync({ id: c.id, dir: -1 }))}
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </Tip>
        <Tip content="Bajar categoría">
          <button
            type="button"
            className={iconBtn}
            aria-label={`Bajar ${c.name}`}
            disabled={i === catalog.categories.length - 1 || moveCategory.isPending}
            onClick={() => run(moveCategory.mutateAsync({ id: c.id, dir: 1 }))}
          >
            <ArrowDown className="size-4" aria-hidden />
          </button>
        </Tip>
        <Tip content="Renombrar">
          <button
            type="button"
            className={iconBtn}
            aria-label={`Renombrar ${c.name}`}
            onClick={() => setCategoryDraft({ mode: 'edit', category: c })}
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        </Tip>
        {count === 0 && (
          <Tip content="Eliminar categoría vacía">
            <button
              type="button"
              className={iconBtn}
              aria-label={`Eliminar ${c.name}`}
              onClick={() => run(deleteCategory.mutateAsync(c.id).then(() => toast(`Categoría «${c.name}» eliminada`)))}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </Tip>
        )}
        <button
          type="button"
          onClick={() => setServiceDraft({ mode: 'new', categoryId: c.id })}
          className={buttonClass({ variant: 'ghost', size: 'sm', className: 'ml-1' })}
        >
          <Plus className="size-4" aria-hidden /> Servicio
        </button>
      </div>
    ) : undefined

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description="Todo lo que aparece en el sitio y en la reserva sale de aquí, en este mismo orden. El precio es el mismo con cualquier barbero."
        actions={
          canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setCategoryDraft({ mode: 'new' })}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                <FolderPlus className="size-4" strokeWidth={1.75} aria-hidden /> Nueva categoría
              </button>
              <button
                type="button"
                onClick={() => setServiceDraft({ mode: 'new' })}
                className={buttonClass({ size: 'sm' })}
              >
                <Plus className="size-4" strokeWidth={2} aria-hidden /> Nuevo servicio
              </button>
            </>
          ) : (
            <Badge>Solo lectura</Badge>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Buscar servicio"
          placeholder="Buscar servicio"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-72"
        />
        <Segmented<Visibility>
          label="Mostrar"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'all', label: 'Todos', count: counts.all },
            { value: 'active', label: 'Visibles', count: counts.active },
            { value: 'hidden', label: 'Ocultos', count: counts.hidden },
          ]}
        />
        {filtering && canEdit && <p className="text-[13px] text-fg-muted">Quita los filtros para cambiar el orden.</p>}
      </div>

      {visibleCategories.length === 0 && (
        <Card>
          <EmptyState icon={FolderPlus} title="Ningún servicio coincide">
            Prueba con otra palabra o muestra todos.
          </EmptyState>
        </Card>
      )}

      {visibleCategories.map(({ category: c, services }) => {
        const shown = services.filter(matches)
        const i = catalog.categories.indexOf(c)
        return (
          <Card
            key={c.id}
            title={c.name}
            description={`${services.length} ${services.length === 1 ? 'servicio' : 'servicios'}`}
            actions={categoryActions(c, i, services.length)}
            bodyClassName="p-0"
          >
            {shown.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">Sin servicios en esta categoría.</p>
            ) : (
              <ul aria-label={c.name} className="divide-y divide-line">
                {shown.map((s, k) => {
                  const staff = (catalog.staffFor[s.id] ?? []).map(staffName).filter(Boolean)
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-3 sm:px-5 md:grid-cols-[auto_minmax(0,1fr)_88px_88px_196px_auto]',
                        !s.active && 'bg-surface',
                      )}
                    >
                      {canEdit && !filtering ? (
                        <div className="flex flex-col">
                          <button
                            type="button"
                            className={cn(iconBtn, 'size-7')}
                            aria-label={`Subir ${s.name}`}
                            disabled={k === 0 || moveService.isPending}
                            onClick={() => run(moveService.mutateAsync({ id: s.id, dir: -1 }))}
                          >
                            <ArrowUp className="size-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={cn(iconBtn, 'size-7')}
                            aria-label={`Bajar ${s.name}`}
                            disabled={k === shown.length - 1 || moveService.isPending}
                            onClick={() => run(moveService.mutateAsync({ id: s.id, dir: 1 }))}
                          >
                            <ArrowDown className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      ) : (
                        <span className="tabular w-7 text-center text-xs text-fg-muted" aria-hidden>
                          {k + 1}
                        </span>
                      )}

                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setServiceDraft({ mode: 'edit', id: s.id })}
                          className={cn(
                            'rounded text-left font-semibold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                            !s.active && 'text-fg-muted',
                          )}
                        >
                          {s.name}
                        </button>
                        <p className="truncate text-[13px] text-fg-muted">{s.description || 'Sin descripción'}</p>
                        <p className="tabular mt-1 text-[13px] text-fg-muted md:hidden">
                          {durationLabel(s.durationMin)} · {money(s.price)}
                        </p>
                      </div>

                      <span className="tabular hidden text-sm text-fg-muted md:block">
                        {durationLabel(s.durationMin)}
                      </span>
                      <span className="tabular hidden text-right font-semibold md:block">{money(s.price)}</span>

                      <div className="hidden items-center gap-2 md:flex">
                        <span
                          className="flex -space-x-2"
                          aria-label={`Lo realizan: ${staff.map((x) => x!.name).join(', ') || 'nadie'}`}
                        >
                          {staff.map((x) => (
                            <Tip key={x!.id} content={x!.name}>
                              <span className="rounded-full ring-2 ring-raised">
                                <Avatar name={x!.name} src={x!.photoUrl} size={28} />
                              </span>
                            </Tip>
                          ))}
                        </span>
                        <span className="flex gap-1.5">
                          {s.loyaltyEligible && <Badge tone="accent">Sello</Badge>}
                          {!s.active && <Badge>Oculto</Badge>}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setServiceDraft({ mode: 'edit', id: s.id })}
                        aria-label={`${canEdit ? 'Editar' : 'Ver'} ${s.name}`}
                        className={cn(iconBtn, 'size-9')}
                      >
                        <ChevronRight className="size-5" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )
      })}

      <ServicePanel draft={serviceDraft} catalog={catalog} canEdit={canEdit} onClose={() => setServiceDraft(null)} />
      <CategoryDialog draft={categoryDraft} onClose={() => setCategoryDraft(null)} />
    </div>
  )
}

type CatalogTab = 'servicios' | 'productos'

/**
 * Servicios y precios, in two tabs: services (what the site and booking offer)
 * and products sold at the shop. The tab lives in the URL (?vista=productos).
 */
export default function Catalog() {
  const [params, setParams] = useSearchParams()
  const tab: CatalogTab = params.get('vista') === 'productos' ? 'productos' : 'servicios'
  const idBase = useId().replace(/:/g, '')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tabs<CatalogTab>
        label="Catálogo"
        idBase={idBase}
        value={tab}
        onChange={(v) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p)
              if (v === 'productos') next.set('vista', v)
              else next.delete('vista')
              return next
            },
            { replace: true },
          )
        }
        tabs={[
          { value: 'servicios', label: 'Servicios' },
          { value: 'productos', label: 'Productos' },
        ]}
      />
      <TabPanel idBase={idBase} value={tab}>
        {tab === 'servicios' ? <ServicesView /> : <ProductsView />}
      </TabPanel>
    </div>
  )
}
