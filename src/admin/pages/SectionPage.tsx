import { lazy, Suspense } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Check, Lock } from 'lucide-react'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { buttonClass } from '@/components/ui/buttonClass'
import { useAdminSession } from '../auth/AdminAuth'
import { roleLabels } from '../domain'
import { canAccess, isSectionId, sectionLabel, sections, showWorkbench, type Section } from '../sections'
import { Card, EmptyState, PageHeader } from '../ui/Panel'

const Workbench = lazy(() => import('./Workbench'))

const TOTAL_DELIVERIES = 8

/** Until a section is built, it explains what it will do, when it arrives and who can open it. */
function Upcoming({ section }: { section: Section }) {
  return (
    <div className="grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader description={section.summary} />
      <Card bodyClassName="p-0">
        <div className="grid md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="p-6">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Qué vas a poder hacer aquí
            </h2>
            <ul className="mt-4 grid gap-3">
              {section.features.map((f) => (
                <li key={f} className="flex gap-3 text-[15px] leading-snug">
                  <Check className="mt-0.5 size-[18px] shrink-0 text-fg-accent" strokeWidth={2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <dl className="grid content-start gap-4 border-t border-line bg-surface p-6 text-sm md:rounded-r-lg md:border-l md:border-t-0">
            <div>
              <dt className="text-fg-muted">Llega en</dt>
              <dd className="tabular mt-0.5 font-semibold">
                Entrega {section.delivery} de {TOTAL_DELIVERIES}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Acceso</dt>
              <dd className="mt-0.5 font-medium">{section.roles.map((r) => roleLabels[r]).join(', ')}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </div>
  )
}

export default function SectionPage() {
  const { section } = useParams()
  const { user } = useAdminSession()
  const valid = isSectionId(section) && (section !== 'componentes' || showWorkbench)
  useDocumentTitle(valid ? `${sectionLabel(section, user.role)} · Panel` : 'Panel', { noindex: true })

  if (!valid) return <Navigate to={routes.adminSection('inicio')} replace />

  if (!canAccess(user.role, section)) {
    return (
      <Card className="max-w-2xl">
        <EmptyState
          icon={Lock}
          title="Esta sección no está disponible para tu rol"
          action={
            <Link to={routes.adminSection('inicio')} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              Ir a la vista general
            </Link>
          }
        >
          {sections[section].label} es para {sections[section].roles.map((r) => roleLabels[r]).join(', ')}. Si la
          necesitas, pide acceso a la persona dueña.
        </EmptyState>
      </Card>
    )
  }

  if (section === 'componentes') {
    return (
      <Suspense fallback={null}>
        <Workbench />
      </Suspense>
    )
  }

  return <Upcoming section={sections[section]} />
}
