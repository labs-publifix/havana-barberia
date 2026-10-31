import { useQuery } from '@tanstack/react-query'
import type { SlotQuery } from '@/data'
import { useRepository } from './RepositoryContext'

export const keys = {
  catalog: ['catalog'] as const,
  staff: ['staff'] as const,
  slots: (q: SlotQuery) => ['slots', q.date, q.staffId, q.serviceIds.join(','), q.excludeAppointmentId ?? ''] as const,
  appointment: (token: string) => ['appointment', token] as const,
  loyalty: (token: string) => ['loyalty', token] as const,
}

export function useCatalog() {
  const repo = useRepository()
  return useQuery({ queryKey: keys.catalog, queryFn: () => repo.listServices(), staleTime: 5 * 60_000 })
}

export function useStaff() {
  const repo = useRepository()
  return useQuery({ queryKey: keys.staff, queryFn: () => repo.listStaff(), staleTime: 5 * 60_000 })
}

export function useSlots(q: SlotQuery | null) {
  const repo = useRepository()
  return useQuery({
    queryKey: q ? keys.slots(q) : ['slots', 'idle'],
    queryFn: () => repo.getAvailableSlots(q!),
    enabled: Boolean(q && q.serviceIds.length > 0),
    staleTime: 15_000,
  })
}

export function useAppointment(token: string | undefined) {
  const repo = useRepository()
  return useQuery({
    queryKey: keys.appointment(token ?? ''),
    queryFn: () => repo.getAppointmentByToken(token!),
    enabled: Boolean(token),
  })
}

export function useLoyalty(token: string | null | undefined) {
  const repo = useRepository()
  return useQuery({
    queryKey: keys.loyalty(token ?? ''),
    queryFn: () => repo.getLoyaltyCardByToken(token!),
    enabled: Boolean(token),
  })
}
