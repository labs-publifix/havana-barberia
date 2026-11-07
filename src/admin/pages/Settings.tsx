import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { BookingRulesView, LoyaltyView, type PolicyForm } from '../settings/PolicyViews'
import { FinanceView } from '../settings/FinanceView'
import { UsersView } from '../settings/UsersView'
import { TabPanel, Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'

type Tab = 'reservas' | 'lealtad' | 'finanzas' | 'usuarios'
const TABS: Tab[] = ['reservas', 'lealtad', 'finanzas', 'usuarios']

const same = (a: PolicyForm, b: PolicyForm) =>
  JSON.stringify(a.policy) === JSON.stringify(b.policy) &&
  [...a.eligible].sort().join() === [...b.eligible].sort().join()

/**
 * Ajustes: booking rules, loyalty and who can enter the panel. The rules apply
 * right away to the public site, the booking flow and the agenda. Tab in the
 * URL (?vista=lealtad | usuarios).
 */
export default function Settings() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const v = params.get('vista') as Tab | null
  const tab: Tab = v && TABS.includes(v) ? v : 'reservas'
  const idBase = useId().replace(/:/g, '')

  const { data: settings } = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => repo.getSettings() })
  const { data: catalog } = useQuery({ queryKey: ['admin', 'catalog'], queryFn: () => repo.getCatalog() })
  const [edit, setEdit] = useState<PolicyForm | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saved: PolicyForm | null = settings
    ? { policy: settings.policy, eligible: settings.services.filter((s) => s.loyaltyEligible).map((s) => s.id) }
    : null
  const form = edit ?? saved
  const dirty = !!edit && !!saved && !same(edit, saved)

  const save = useMutation({
    mutationFn: (f: PolicyForm) => repo.savePolicy({ policy: f.policy, loyaltyServiceIds: f.eligible }),
    onSuccess: async ({ cardsCompleted }) => {
      setEdit(null)
      setError(null)
      await Promise.all(
        [['admin'], ['policy'], ['slots'], ['loyalty']].map((queryKey) => qc.invalidateQueries({ queryKey })),
      )
      toast(
        cardsCompleted
          ? `Ajustes guardados · ${cardsCompleted} ${cardsCompleted === 1 ? 'cliente completó' : 'clientes completaron'} su tarjeta`
          : 'Ajustes guardados',
      )
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const onChange = (f: PolicyForm) => {
    setError(null)
    setEdit(f)
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tabs<Tab>
        label="Ajustes"
        idBase={idBase}
        value={tab}
        onChange={(t) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p)
              if (t === 'reservas') next.delete('vista')
              else next.set('vista', t)
              return next
            },
            { replace: true },
          )
        }
        tabs={[
          { value: 'reservas', label: 'Reservas' },
          { value: 'lealtad', label: 'Lealtad' },
          { value: 'finanzas', label: 'Finanzas' },
          { value: 'usuarios', label: 'Usuarios y roles' },
        ]}
      />
      <TabPanel idBase={idBase} value={tab}>
        {tab === 'usuarios' ? (
          <UsersView />
        ) : tab === 'finanzas' ? (
          <FinanceView />
        ) : !form || !saved || !catalog ? (
          <div className="grid gap-4" aria-busy="true">
            <Skeleton className="h-72 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : (
          <div className="grid gap-6">
            {tab === 'reservas' ? (
              <BookingRulesView form={form} onChange={onChange} />
            ) : (
              <LoyaltyView
                form={form}
                saved={saved.policy}
                onChange={onChange}
                services={settings!.services}
                categories={[...catalog.categories].sort((a, b) => a.order - b.order)}
              />
            )}
            {error && (
              <Alert tone="danger" title="No se pudo guardar">
                {error}
              </Alert>
            )}
          </div>
        )}
      </TabPanel>

      {dirty && (tab === 'reservas' || tab === 'lealtad') && (
        <div
          role="region"
          aria-label="Cambios sin guardar"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised px-5 py-3 shadow-lg"
        >
          <p className="text-sm font-medium">Tienes cambios sin guardar. Aplican al sitio en cuanto guardes.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEdit(null)
                setError(null)
              }}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => edit && save.mutate(edit)}
              className={buttonClass({ size: 'sm' })}
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
