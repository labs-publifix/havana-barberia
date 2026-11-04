import * as DM from '@radix-ui/react-dropdown-menu'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, LogOut } from 'lucide-react'
import { routes } from '@/app/routes'
import { cn } from '@/lib/cn'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { roleLabels } from '../domain'
import { canAccess, isSectionId } from '../sections'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase()

const item = cn(
  'flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-sm text-fg outline-none coarse:h-11',
  'data-[highlighted]:bg-fg/[0.06]',
)

export function UserMenu() {
  const { user } = useAdminSession()
  const { signOut, switchTo, repo } = useAdminAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const switchUser = async (id: string) => {
    if (!switchTo) return
    const s = await switchTo(id)
    const current = pathname.split('/')[2]
    if (!isSectionId(current) || !canAccess(s.user.role, current)) navigate(routes.adminSection('inicio'))
  }

  return (
    <DM.Root>
      <DM.Trigger
        className={cn(
          'flex h-10 items-center gap-2.5 rounded-full py-1 pl-1 pr-2 text-left hover:bg-fg/[0.05] coarse:h-11 md:pr-3',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
        )}
        aria-label={`Cuenta: ${user.name}, ${roleLabels[user.role]}`}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-semibold text-white"
        >
          {initials(user.name)}
        </span>
        <span className="hidden min-w-0 leading-tight md:block" aria-hidden>
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          {user.name !== roleLabels[user.role] && (
            <span className="block text-xs text-fg-muted">{roleLabels[user.role]}</span>
          )}
        </span>
        <ChevronDown className="size-4 text-fg-muted" aria-hidden />
      </DM.Trigger>

      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={8}
          className="z-dropdown w-[280px] rounded-lg border border-line bg-raised p-1.5 text-fg shadow-lg data-[state=open]:animate-[fade-in_150ms_ease-out]"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
          </div>

          {repo.demo && (
            <>
              <DM.Separator className="my-1 h-px bg-line" />
              <DM.Label className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted">
                Ver como (demostración)
              </DM.Label>
              <DM.RadioGroup value={user.id} onValueChange={(id) => void switchUser(id)}>
                {repo.demo.users.map((u) => (
                  <DM.RadioItem key={u.id} value={u.id} className={item}>
                    <span className="grid size-4 place-items-center">
                      <DM.ItemIndicator>
                        <Check className="size-4" strokeWidth={2.25} aria-hidden />
                      </DM.ItemIndicator>
                    </span>
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                    {u.role === 'barber' && <span className="text-xs text-fg-muted">{roleLabels[u.role]}</span>}
                  </DM.RadioItem>
                ))}
              </DM.RadioGroup>
            </>
          )}

          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item
            className={item}
            onSelect={() => {
              void signOut().then(() => navigate(routes.adminLogin, { replace: true }))
            }}
          >
            <LogOut className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
            Cerrar sesión
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}
