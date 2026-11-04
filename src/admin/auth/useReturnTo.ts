import { useLocation } from 'react-router-dom'
import { routes } from '@/app/routes'

/** Where to go after signing in. */
export function useReturnTo() {
  const state = useLocation().state as { from?: string } | null
  const from = state?.from
  return from && from.startsWith('/admin/') && !from.startsWith(routes.adminLogin)
    ? from
    : routes.adminSection('inicio')
}
