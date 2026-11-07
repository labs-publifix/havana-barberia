import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { routes } from '@/app/routes'
import { useRepository } from '@/app/RepositoryContext'
import { AdminAuthProvider } from './auth/AdminAuth'
import { RequireSession } from './auth/guards'
import { createAdminRepository, type AdminRepository } from './data'
import { AdminLayout } from './layout/AdminLayout'
import Login from './pages/Login'
import SectionPage from './pages/SectionPage'
import Verify from './pages/Verify'
import { ToastProvider } from './ui/Toast'
import { TooltipProvider } from './ui/Tooltip'

/**
 * Admin panel, mounted at /admin/*. Loaded as its own chunk so the public site
 * does not carry it. Uses its own repository (mock today, Supabase in hito 1C).
 */
export default function AdminApp({ repository }: { repository?: AdminRepository }) {
  const booking = useRepository()
  const [repo] = useState(() => repository ?? createAdminRepository(booking))
  return (
    <AdminAuthProvider repository={repo}>
      <ToastProvider>
        <TooltipProvider delayDuration={250} skipDelayDuration={150}>
          <Routes>
            <Route path="entrar" element={<Login />} />
            <Route path="verificar" element={<Verify />} />
            <Route
              element={
                <RequireSession>
                  <AdminLayout />
                </RequireSession>
              }
            >
              <Route index element={<Navigate to={routes.adminSection('inicio')} replace />} />
              <Route path=":section" element={<SectionPage />} />
            </Route>
            <Route path="*" element={<Navigate to={routes.adminSection('inicio')} replace />} />
          </Routes>
        </TooltipProvider>
      </ToastProvider>
    </AdminAuthProvider>
  )
}
