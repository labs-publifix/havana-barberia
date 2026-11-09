import { lazy, Suspense } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Check, Lock } from 'lucide-react'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { buttonClass } from '@/components/ui/buttonClass'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { roleLabels } from '../domain'
import { canAccess, isSectionId, sectionLabel, sections, showWorkbench, type Section } from '../sections'
import { Card, EmptyState, PageHeader } from '../ui/Panel'

const Workbench = lazy(() => import('./Workbench'))
const Overview = lazy(() => import('./Overview'))
const Agenda = lazy(() => import('./Agenda'))
const Customers = lazy(() => import('./Customers'))
const Catalog = lazy(() => import('./Catalog'))
const Team = lazy(() => import('./Team'))
const Settings = lazy(() => import('./Settings'))
const Commissions = lazy(() => import('./Commissions'))
const Payroll = lazy(() => import('./Payroll'))
const Sales = lazy(() => import('./Sales'))
const Reports = lazy(() => import('./Reports'))

const TOTAL_DELIVERIES = 8

/** Until a section is built, it explains what it will do, when it arrives and who can open it. */
function Upcoming({ section, connecting }: { section: Section; connecting?: boolean }) {
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
              <dt className="text-fg-muted">{connecting ? 'Estado' : 'Llega en'}</dt>
              <dd className="tabular mt-0.5 font-semibold">
                {connecting
                  ? 'Se conecta a la base de datos en la siguiente entrega'
                  : `Entrega ${section.delivery} de ${TOTAL_DELIVERIES}`}
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
  const { repo } = useAdminAuth()
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

  // A data source still connecting some sections (Supabase, entrega por entrega).
  if (repo.available && !repo.available.includes('agenda') && section === 'inicio') return <ConnectingWelcome />
  if (repo.available && !repo.available.includes(section)) return <Upcoming section={sections[section]} connecting />

  if (section === 'inicio') {
    return (
      <Suspense fallback={null}>
        <Overview />
      </Suspense>
    )
  }

  if (section === 'agenda') {
    return (
      <Suspense fallback={null}>
        <Agenda />
      </Suspense>
    )
  }

  if (section === 'clientes') {
    return (
      <Suspense fallback={null}>
        <Customers />
      </Suspense>
    )
  }

  if (section === 'catalogo') {
    return (
      <Suspense fallback={null}>
        <Catalog />
      </Suspense>
    )
  }

  if (section === 'equipo') {
    return (
      <Suspense fallback={null}>
        <Team />
      </Suspense>
    )
  }

  if (section === 'comisiones') {
    return (
      <Suspense fallback={null}>
        <Commissions />
      </Suspense>
    )
  }

  if (section === 'ventas') {
    return (
      <Suspense fallback={null}>
        <Sales />
      </Suspense>
    )
  }

  if (section === 'reportes') {
    return (
      <Suspense fallback={null}>
        <Reports />
      </Suspense>
    )
  }

  if (section === 'cierre') {
    return (
      <Suspense fallback={null}>
        <Payroll />
      </Suspense>
    )
  }

  if (section === 'ajustes') {
    return (
      <Suspense fallback={null}>
        <Settings />
      </Suspense>
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

/**
 * Inicio while the agenda is not connected yet: what the owner can already
 * capture in the real system.
 */
function ConnectingWelcome() {
  const { user } = useAdminSession()
  const steps = [
    { id: 'catalogo', what: 'Servicios, precios y productos (con costo y comisión)' },
    { id: 'equipo', what: 'Barberos: horarios, servicios que dan y comisión de cada uno' },
    { id: 'ajustes', what: 'Políticas de reserva y lealtad, finanzas y usuarios del equipo' },
  ] as const
  return (
    <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description={`Hola, ${user.name}. Este es el sistema real: lo que captures aquí se queda guardado.`}
      />
      <Card
        title="Para empezar"
        description="La agenda, los clientes y las finanzas se conectan en la siguiente entrega."
      >
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3">
              <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-fg/[0.06] text-sm font-semibold">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-[15px]">
                <Link to={routes.adminSection(s.id)} className="font-semibold underline underline-offset-4">
                  {sections[s.id].label}
                </Link>
                <span className="block text-fg-muted">{s.what}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  )
}
