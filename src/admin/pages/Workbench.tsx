import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, ShieldCheck, UserRound, Users } from 'lucide-react'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import type { AppointmentStatus } from '@/domain/types'
import { useAdminAuth } from '../auth/AdminAuth'
import { roleLabels, type AdminRole, type AdminUser } from '../domain'
import { Input, Kbd, SearchInput, Segmented, Switch } from '../ui/controls'
import { Select } from '../ui/Select'
import { DataTable, type Column } from '../ui/DataTable'
import { Card, PageHeader, StatCard } from '../ui/Panel'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { isFinanceRole } from '../domain'

type RoleFilter = AdminRole | 'all'

const statuses: AppointmentStatus[] = ['booked', 'confirmed', 'completed', 'cancelled', 'no_show']

/** Normalize for accent-insensitive search ("Gomez" finds "Gómez"). */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function UserEditor({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const toast = useToast()
  const [draft, setDraft] = useState<AdminUser | null>(user)
  const [shownFor, setShownFor] = useState(user?.id)
  if (user?.id !== shownFor) {
    setShownFor(user?.id)
    setDraft(user)
  }
  const mfaLocked = isFinanceRole(draft?.role)

  return (
    <SidePanel
      open={!!user}
      onOpenChange={(o) => !o && onClose()}
      title={user ? user.name : ''}
      description="Ejemplo de panel lateral de edición."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              toast('Cambios guardados (demostración)')
              onClose()
            }}
            className={buttonClass({ size: 'sm' })}
          >
            Guardar cambios
          </button>
        </>
      }
    >
      {draft && (
        <form className="grid gap-5" onSubmit={(e) => e.preventDefault()}>
          <Input label="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input
            label="Correo"
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            hint="Aquí llega la invitación y la recuperación de contraseña."
          />
          <Select
            label="Rol"
            value={draft.role}
            onValueChange={(v) => {
              const role = v as AdminRole
              setDraft({ ...draft, role, mfaRequired: isFinanceRole(role) || draft.mfaRequired })
            }}
            options={(Object.keys(roleLabels) as AdminRole[]).map((r) => ({ value: r, label: roleLabels[r] }))}
          />
          <div className="grid gap-4 rounded-md border border-line p-4">
            <Switch
              label="Acceso activo"
              description="Si lo desactivas, la persona ya no puede entrar al panel."
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
            <Switch
              label="Verificación en dos pasos"
              description={mfaLocked ? 'Obligatoria para dueño y gerente.' : 'Opcional para este rol.'}
              checked={mfaLocked || draft.mfaRequired}
              disabled={mfaLocked}
              onChange={(mfaRequired) => setDraft({ ...draft, mfaRequired })}
            />
          </div>
          <Input
            label="Monto (ejemplo de campo con prefijo)"
            inputMode="decimal"
            prefix="$"
            suffix="MXN"
            placeholder="0"
            hint="Así se capturarán precios, anticipos y comisiones."
          />
        </form>
      )}
    </SidePanel>
  )
}

/**
 * Workbench: the admin's building blocks with fictitious data, so the client can
 * review density, tables, filters and side panels before the sections use them.
 */
export default function Workbench() {
  const { repo } = useAdminAuth()
  const { data: users } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => repo.listUsers() })
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [open, setOpen] = useState<AdminUser | null>(null)
  const toast = useToast()

  const counts = useMemo(() => {
    const c: Record<RoleFilter, number> = { all: 0, owner: 0, developer: 0, manager: 0, reception: 0, barber: 0 }
    users?.forEach((u) => {
      c.all++
      c[u.role]++
    })
    return c
  }, [users])

  const rows = useMemo(() => {
    const q = fold(query.trim())
    return users?.filter((u) => (role === 'all' || u.role === role) && (!q || fold(`${u.name} ${u.email}`).includes(q)))
  }, [users, query, role])

  const columns: Column<AdminUser>[] = [
    { id: 'name', header: 'Nombre', primary: true, cell: (u) => u.name, sortValue: (u) => u.name },
    { id: 'email', header: 'Correo', cell: (u) => <span className="text-fg-muted">{u.email}</span>, hideBelow: 'md' },
    { id: 'role', header: 'Rol', cell: (u) => roleLabels[u.role], sortValue: (u) => roleLabels[u.role] },
    {
      id: 'mfa',
      header: 'Dos pasos',
      hideBelow: 'lg',
      cell: (u) => (u.mfaRequired ? <Badge tone="accent">Activa</Badge> : <Badge>No</Badge>),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (u) => (u.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>),
    },
  ]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader description="Piezas base del panel con datos ficticios. Cada sección las irá usando; aquí se revisan densidad, tablas, filtros y paneles." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Usuarios activos" value={counts.all} icon={Users} detail="Ejemplo de indicador" />
        <StatCard
          label="Con verificación en dos pasos"
          value={users?.filter((u) => u.mfaRequired).length ?? '—'}
          icon={ShieldCheck}
          detail="Obligatoria para dueño y gerente"
        />
        <StatCard label="Barberos con acceso" value={counts.barber} icon={UserRound} detail="Ven solo su agenda" />
      </div>

      <Card
        title="Tabla con filtros"
        description="Ordena con los encabezados; abre una fila con clic o con Tab y Enter."
        actions={
          <button
            type="button"
            className={buttonClass({ size: 'sm' })}
            onClick={() => toast('Las invitaciones se activan al conectar Supabase')}
          >
            <Plus className="size-4" strokeWidth={2} aria-hidden /> Invitar usuario
          </button>
        }
        bodyClassName="grid grid-cols-[minmax(0,1fr)] gap-4 p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            label="Buscar usuario"
            placeholder="Buscar por nombre o correo"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-72"
          />
          <Segmented<RoleFilter>
            label="Filtrar por rol"
            value={role}
            onChange={setRole}
            className="max-w-full overflow-x-auto"
            options={[
              { value: 'all', label: 'Todos', count: counts.all },
              { value: 'owner', label: 'Dueño', count: counts.owner },
              { value: 'manager', label: 'Gerente', count: counts.manager },
              { value: 'reception', label: 'Recepción', count: counts.reception },
              { value: 'barber', label: 'Barbero', count: counts.barber },
            ]}
          />
        </div>
        <DataTable
          caption="Usuarios del panel (datos ficticios)"
          columns={columns}
          rows={rows}
          rowKey={(u) => u.id}
          onRowOpen={setOpen}
          selectedKey={open?.id}
          initialSort={{ id: 'name', dir: 'asc' }}
          empty="Ningún usuario coincide con la búsqueda."
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Botones" description="Píldora; negro para la acción principal sobre claro.">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={buttonClass({ size: 'sm' })}>
              Guardar
            </button>
            <button type="button" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              Cancelar
            </button>
            <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              Ver detalle
            </button>
            <button type="button" className={buttonClass({ variant: 'danger', size: 'sm' })}>
              Cancelar cita
            </button>
            <button type="button" disabled className={buttonClass({ size: 'sm' })}>
              Deshabilitado
            </button>
          </div>
        </Card>
        <Card title="Estados de cita" description="El color nunca va solo: siempre con texto.">
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
            Atajos de teclado (próximas entregas): <Kbd>N</Kbd> nueva cita · <Kbd>/</Kbd> buscar · <Kbd>Esc</Kbd> cerrar
            panel
          </p>
        </Card>
      </div>

      <UserEditor user={open} onClose={() => setOpen(null)} />
    </div>
  )
}
