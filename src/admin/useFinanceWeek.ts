import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { business } from '@/config/business'
import { localDate } from '@/lib/time'
import { useAdminAuth } from './auth/AdminAuth'
import { weekStart } from './finance'

/**
 * The payroll week being viewed (its first day per Ajustes › Finanzas) and the
 * current one. Until the settings load the week starts on Monday.
 */
export function useFinanceWeek() {
  const { repo } = useAdminAuth()
  const { data: settings } = useQuery({
    queryKey: ['admin', 'finance-settings'],
    queryFn: () => repo.getFinanceSettings(),
  })
  const startDay = settings?.weekStartDay ?? 1
  const current = weekStart(localDate(new Date(), business.hours.timeZone), startDay)
  const [from, setFrom] = useState(current)
  // When the start day changes, jump to the matching current week.
  useEffect(() => setFrom(current), [current])
  return { from, setFrom, current, settings }
}
