import { Link, NavLink } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { routes } from '@/app/routes'
import { useOpenStatus } from '@/features/site/useOpenStatus'
import { cn } from '@/lib/cn'
import { useAdminSession } from '../auth/AdminAuth'
import { navFor, sectionLabel, sections, showWorkbench } from '../sections'

/** Navigation filtered by role. Dark column: the brand anchors the tool without competing with content. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAdminSession()
  const groups = navFor(user.role, { showWorkbench })
  const status = useOpenStatus()

  return (
    <div data-theme="dark" className="flex h-full flex-col bg-ink-950 text-white">
      <div className="flex h-20 shrink-0 items-center px-5">
        <Link
          to={routes.adminSection('inicio')}
          onClick={onNavigate}
          className="rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400"
        >
          <Logo variant="white" priority className="w-[92px]" />
        </Link>
      </div>

      <nav aria-label="Secciones del panel" className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.label} className="mt-6 first:mt-1">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{g.label}</p>
            <ul className="grid gap-0.5">
              {g.items.map((id) => {
                const Icon = sections[id].icon
                return (
                  <li key={id}>
                    <NavLink
                      to={routes.adminSection(id)}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'relative flex h-10 items-center gap-3 rounded-md px-3 text-[14.5px] font-medium transition-colors duration-fast coarse:h-11',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-aqua-400',
                          isActive
                            ? 'bg-white/[0.09] text-white'
                            : 'text-gray-300 hover:bg-white/[0.05] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-aqua-500" />
                          )}
                          <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                          <span className="truncate">{sectionLabel(id, user.role)}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="grid gap-3 border-t border-white/10 px-5 py-4 text-[13px]">
        <p className="flex items-center gap-2 text-gray-300">
          <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', status.open ? 'bg-aqua-500' : 'bg-gray-500')}
          />
          {status.chip}
        </p>
        <a
          href={`${import.meta.env.BASE_URL}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
        >
          Ver sitio público <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      </div>
    </div>
  )
}
