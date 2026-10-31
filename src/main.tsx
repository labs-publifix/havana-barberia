import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DataProvider } from './data/DataContext'
import Home from './pages/Home'
import Book from './pages/Book'
import Confirmation from './pages/Confirmation'
import AdminLayout from './pages/admin/AdminLayout'
import Agenda from './pages/admin/Agenda'
import Appointments from './pages/admin/Appointments'
import { Barbers, Services } from './pages/admin/Catalog'
import SettingsPage from './pages/admin/SettingsPage'
import './styles/global.css'
import './styles/public.css'
import './styles/admin.css'

// HashRouter: GitHub Pages solo sirve archivos estáticos, así las rutas
// (/#/reservar, /#/admin) funcionan al recargar o compartir el enlace.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reservar" element={<Book />} />
          <Route path="/cita/:id" element={<Confirmation />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Agenda />} />
            <Route path="citas" element={<Appointments />} />
            <Route path="servicios" element={<Services />} />
            <Route path="barberos" element={<Barbers />} />
            <Route path="ajustes" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </DataProvider>
  </StrictMode>,
)
