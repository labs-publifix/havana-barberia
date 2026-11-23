import { useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CashClosesView } from '../closes/CashClosesView'
import { TipsView } from '../closes/TipsView'
import { TabPanel, Tabs } from '../ui/Tabs'
import Payroll from './Payroll'

type ClosesTab = 'cortes' | 'propinas' | 'nomina'
const TABS: { value: ClosesTab; label: string }[] = [
  { value: 'cortes', label: 'Cortes de caja' },
  { value: 'propinas', label: 'Propinas' },
  { value: 'nomina', label: 'Nómina semanal' },
]

/**
 * Cierres (owner and manager): every close in one place. Cortes de caja (the
 * daily closes, filtered), Propinas (pay tips apart, receipts and history) and
 * the weekly payroll. The tab lives in the address (?vista=propinas).
 */
export default function Closes() {
  const [params, setParams] = useSearchParams()
  const v = params.get('vista')
  const tab: ClosesTab = v === 'propinas' || v === 'nomina' ? v : 'cortes'
  const idBase = useId().replace(/:/g, '')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Tabs<ClosesTab>
        label="Cierres"
        idBase={idBase}
        value={tab}
        onChange={(next) =>
          setParams(
            (p) => {
              const q = new URLSearchParams(p)
              if (next === 'cortes') q.delete('vista')
              else q.set('vista', next)
              // Each tab has its own default period.
              q.delete('periodo')
              q.delete('desde')
              q.delete('hasta')
              return q
            },
            { replace: true },
          )
        }
        tabs={TABS}
      />
      <TabPanel idBase={idBase} value={tab}>
        {tab === 'propinas' ? <TipsView /> : tab === 'nomina' ? <Payroll /> : <CashClosesView />}
      </TabPanel>
    </div>
  )
}
