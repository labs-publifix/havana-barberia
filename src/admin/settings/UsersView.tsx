import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, ShieldCheck, UserPlus } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import type { Staff } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { roleLabels, roleSummaries, type AdminRole, type AdminUser } from '../domain'
import { canAccess, navGroups, sectionLabel, sections, type SectionId } from '../sections'
import { Input, Switch } from '../ui/controls'
import { Card } from '../ui/Panel'
import { Select } from '../ui/Select'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'

const ROLES: AdminRole[] = ['owner', 'manager', 'reception', 'barber']

type Draft = { mode: 'new'; staffId?: string } | { mode: 'edit'; user: AdminUser }

/** Usuarios y roles: who can enter the panel and what each role sees. Only the owner edits. */
export function UsersView() {
  const { repo } = useAdminAuth()
  const { user: me } = useAdminSession()
  const canEdit = me.role === 'owner'
  const { data: users } = useQuery({ queryKey: ['admin', 'users'], queryFn: () => repo.listUsers() })
  const { data: team } = useQuery({ queryKey: ['admin', 'team'], queryFn: () => repo.getTeam() })
  const [draft, setDraft] = useState<Draft | null>(null)

  const staff = team?.staff ?? []
  const linked = new Set((users ?? []).filter((u) => u.role === 'barber').map((u) => u.staffId))
  const withoutAccess = staff.filter((s) => s.active && !linked.has(s.id))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card
        title="Usuarios"
        description="Quién entra al panel. Cada persona entra con su correo y su contraseña."
        actions={
          canEdit ? (
            <button type="button" onClick={() => setDraft({ mode: 'new' })} className={buttonClass({ size: 'sm' })}>
              <UserPlus className="size-4" strokeWidth={2} aria-hidden /> Invitar usuario
            </button>
          ) : (
            <Badge>Solo la persona dueña los administra</Badge>
          )
        }
        bodyClassName="p-0"
      >
        {!users ? (
          <p className="p-5 text-sm text-fg-muted" aria-busy="true">
            Cargando usuarios…
          </p>
        ) : (
          <ul aria-label="Usuarios" className="divide-y divide-line">
            {users.map((u) => {
              const barber = staff.find((s) => s.id === u.staffId)
              return (
                <li
                  key={u.id}
                  className={cn(
                    'grid gap-3 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
                    !u.active && 'bg-surface',
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn('flex flex-wrap items-center gap-x-2 font-semibold', !u.active && 'text-fg-muted')}
                    >
                      <span className="truncate">{u.name}</span>
                      {u.id === me.id && <span className="text-[13px] font-normal text-fg-muted">(tú)</span>}
                    </p>
                    <p className="truncate text-sm text-fg-muted">{u.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={u.role === 'owner' || u.role === 'manager' ? 'accent' : 'neutral'}>
                        {roleLabels[u.role]}
                        {barber ? ` · ${barber.name}` : ''}
                      </Badge>
                      {u.mfaRequired && (
                        <Badge tone="info">
                          <ShieldCheck className="size-3.5" aria-hidden /> Dos pasos
                        </Badge>
                      )}
                      {!u.active && <Badge>Sin acceso</Badge>}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setDraft({ mode: 'edit', user: u })}
                      aria-label={`Editar a ${u.name}`}
                      className={cn(buttonClass({ variant: 'secondary', size: 'sm' }), 'justify-self-start')}
                    >
                      Editar
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canEdit && withoutAccess.length > 0 && users && (
          <div className="grid gap-2 border-t border-line px-5 py-4">
            <p className="text-sm text-fg-muted">
              Barberos del equipo sin acceso al panel (verían su agenda y comisiones):
            </p>
            <div className="flex flex-wrap gap-2">
              {withoutAccess.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDraft({ mode: 'new', staffId: s.id })}
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                >
                  Dar acceso a {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <RoleMatrix />

      <UserPanel draft={draft} users={users ?? []} staff={staff} meId={me.id} onClose={() => setDraft(null)} />
    </div>
  )
}

/** What each role can open, straight from the navigation rules. */
function RoleMatrix() {
  const items = navGroups.flatMap((g) => g.items).filter((id) => id !== 'componentes')
  const note = (role: AdminRole, id: SectionId): string | null => {
    if (!canAccess(role, id)) return null
    if (role === 'reception' && (id === 'catalogo' || id === 'equipo')) return 'Consulta'
    if (role === 'barber' && (id === 'agenda' || id === 'comisiones')) return 'Solo lo suyo'
    return ''
  }
  return (
    <Card
      title="Qué ve cada rol"
      description="Costos, comisiones y márgenes solo los ven dueño y gerente."
      bodyClassName="p-0"
    >
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Secciones del panel por rol</caption>
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className="px-5 py-3 font-medium text-fg-muted">
                Sección
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-3 py-3 font-semibold">
                  {roleLabels[r]}
                  <span className="block text-[12px] font-normal text-fg-muted">{roleSummaries[r]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((id) => (
              <tr key={id}>
                <th scope="row" className="px-5 py-2.5 text-left font-medium">
                  {sections[id].label}
                </th>
                {ROLES.map((r) => {
                  const n = note(r, id)
                  return (
                    <td key={r} className="px-3 py-2.5">
                      {n === null ? (
                        <Minus className="size-4 text-gray-400" aria-label="No" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="size-4 text-fg-accent" strokeWidth={2.25} aria-label="Sí" />
                          {n && <span className="text-[13px] text-fg-muted">{n}</span>}
                          {r === 'barber' && sectionLabel(id, r) !== sections[id].label && !n && (
                            <span className="text-[13px] text-fg-muted">{sectionLabel(id, r)}</span>
                          )}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

interface Form {
  name: string
  email: string
  role: AdminRole
  staffId: string
  active: boolean
}

function UserPanel({
  draft,
  users,
  staff,
  meId,
  onClose,
}: {
  draft: Draft | null
  users: AdminUser[]
  staff: Staff[]
  meId: string
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Form>({ name: '', email: '', role: 'reception', staffId: '', active: true })
  const [error, setError] = useState<string | null>(null)
  const editing = draft?.mode === 'edit' ? draft.user : null
  const self = editing?.id === meId

  useEffect(() => {
    if (!draft) return
    setError(null)
    if (draft.mode === 'edit') {
      const u = draft.user
      setForm({ name: u.name, email: u.email, role: u.role, staffId: u.staffId ?? '', active: u.active })
    } else {
      const s = staff.find((x) => x.id === draft.staffId)
      setForm({ name: s?.name ?? '', email: '', role: s ? 'barber' : 'reception', staffId: s?.id ?? '', active: true })
    }
    // Only when the panel opens for someone else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const taken = new Set(users.filter((u) => u.role === 'barber' && u.id !== editing?.id).map((u) => u.staffId))
  const barberOptions = staff
    .filter((s) => !taken.has(s.id) || s.id === form.staffId)
    .map((s) => ({ value: s.id, label: s.active ? s.name : `${s.name} (inactivo)` }))

  const save = useMutation({
    mutationFn: () =>
      repo.saveUser({
        id: editing?.id,
        name: form.name,
        email: form.email,
        role: form.role,
        staffId: form.role === 'barber' ? form.staffId || null : null,
        active: form.active,
      }),
    onSuccess: async (u) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast(editing ? 'Usuario actualizado' : `Invitación lista para ${u.name}`)
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  return (
    <SidePanel
      open={!!draft}
      onOpenChange={(o) => !o && onClose()}
      title={editing ? editing.name : 'Invitar usuario'}
      description={editing ? editing.email : 'Le llega un correo para crear su contraseña.'}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className={buttonClass({ size: 'sm' })}
          >
            {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Enviar invitación'}
          </button>
        </>
      }
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        {error && (
          <Alert tone="danger" title="No se pudo guardar">
            {error}
          </Alert>
        )}
        <Input label="Nombre" value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
        <Input
          label="Correo"
          type="email"
          inputMode="email"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
          autoComplete="off"
          hint="Con este correo entra al panel."
        />
        <fieldset className="grid gap-2" disabled={self}>
          <legend className="mb-1.5 text-[13px] font-medium">Rol</legend>
          {ROLES.map((r) => (
            <label
              key={r}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border-[1.5px] px-4 py-3 transition-colors duration-fast',
                form.role === r ? 'border-fg' : 'border-line hover:border-line-strong',
                self && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={form.role === r}
                onChange={() => set({ role: r })}
                className="mt-1 size-4 accent-ink-950"
              />
              <span>
                <span className="block text-sm font-semibold">{roleLabels[r]}</span>
                <span className="block text-[13px] text-fg-muted">{roleSummaries[r]}</span>
              </span>
            </label>
          ))}
          {self && <p className="text-[13px] text-fg-muted">No puedes cambiar tu propio rol.</p>}
        </fieldset>
        {form.role === 'barber' && (
          <Select
            label="Perfil en Equipo"
            value={form.staffId}
            onValueChange={(staffId) => set({ staffId })}
            options={[{ value: '', label: 'Elige al barbero' }, ...barberOptions]}
            hint="Verá solo su agenda y sus comisiones."
          />
        )}
        <p className="flex items-start gap-2 text-[13px] text-fg-muted">
          <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden />
          Entra con su correo y una contraseña que crea al abrir la invitación.
        </p>
        {editing && (
          <div className="rounded-md border border-line p-4">
            <Switch
              label="Acceso al panel"
              description={self ? 'No puedes quitarte el acceso.' : 'Al quitarlo, su sesión se cierra.'}
              checked={form.active}
              disabled={self}
              onChange={(active) => set({ active })}
            />
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </SidePanel>
  )
}
