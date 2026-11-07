import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SlotUnavailableError } from '@/data'
import { useAdminAuth } from '../auth/AdminAuth'

/** Message to show for any error coming from the repository. */
export function errorMessage(e: unknown) {
  if (e instanceof SlotUnavailableError) return 'Ese horario ya está ocupado. Elige otro.'
  if (e instanceof Error && e.message) return e.message
  return 'No se pudo guardar. Intenta de nuevo.'
}

/**
 * Agenda mutations. Each one refreshes every loaded day (agenda and overview),
 * so what one person changes shows up right away on the shop screen.
 */
export function useAgendaActions() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'day'] })
  const opts = { onSuccess: refresh }

  return {
    setStatus: useMutation({
      mutationFn: (v: Parameters<typeof repo.setAppointmentStatus>) => repo.setAppointmentStatus(...v),
      ...opts,
    }),
    complete: useMutation({
      mutationFn: (v: Parameters<typeof repo.completeAppointment>) => repo.completeAppointment(...v),
      ...opts,
    }),
    create: useMutation({ mutationFn: repo.createAppointment.bind(repo), ...opts }),
    reschedule: useMutation({
      mutationFn: (v: Parameters<typeof repo.rescheduleAppointment>) => repo.rescheduleAppointment(...v),
      ...opts,
    }),
    notes: useMutation({
      mutationFn: (v: Parameters<typeof repo.updateAppointmentNotes>) => repo.updateAppointmentNotes(...v),
      ...opts,
    }),
    createBlock: useMutation({ mutationFn: repo.createBlock.bind(repo), ...opts }),
    deleteBlock: useMutation({ mutationFn: repo.deleteBlock.bind(repo), ...opts }),
  }
}
