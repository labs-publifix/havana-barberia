import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { routes } from '@/app/routes'
import { isSessionComplete } from '../domain'
import { useAdminAuth } from './AdminAuth'

/**
 * Only lets complete sessions through: no session → login (remembering where
 * the person was going); password ok but second step pending → verification.
 * Real protection comes from Supabase Auth + RLS; this only shapes the UI.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useAdminAuth()
  const location = useLocation()
  if (session === undefined) return <div className="min-h-dvh bg-surface" aria-busy="true" />
  if (!session) return <Navigate to={routes.adminLogin} replace state={{ from: location.pathname }} />
  if (!isSessionComplete(session)) return <Navigate to={routes.adminVerify} replace state={location.state} />
  return <>{children}</>
}
