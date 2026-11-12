import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { business } from '@/config/business'
import { localDate } from '@/lib/time'
import { useAdminAuth } from './auth/AdminAuth'
import { periodAt, periodFromParams, periodToParams, type Period, type PeriodUnit } from './period'

const tz = business.hours.timeZone

/**
 * The period a screen shows, kept in the address (?periodo=…&desde=…&hasta=…)
 * so a reload or a shared link opens the same dates. Weeks follow the payroll
 * week (Ajustes › Finanzas).
 */
export function usePeriod(defaultUnit: Exclude<PeriodUnit, 'range'>) {
  const { repo } = useAdminAuth()
  const { data: settings } = useQuery({
    queryKey: ['admin', 'finance-settings'],
    queryFn: () => repo.getFinanceSettings(),
  })
  const weekStartDay = settings?.weekStartDay ?? 1
  const today = localDate(new Date(), tz)
  const [params, setParams] = useSearchParams()
  const period = periodFromParams(params, today, weekStartDay) ?? periodAt(defaultUnit, today, weekStartDay)
  const setPeriod = (p: Period) => setParams((prev) => periodToParams(p, prev), { replace: true })
  return { period, setPeriod, today, weekStartDay, settings }
}
