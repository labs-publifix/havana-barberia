import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Home from '@/pages/Home'

const Booking = lazy(() => import('@/pages/Booking'))
const Confirmation = lazy(() => import('@/pages/Confirmation'))
const ManageAppointment = lazy(() => import('@/pages/ManageAppointment'))
const Loyalty = lazy(() => import('@/pages/Loyalty'))
const Legal = lazy(() => import('@/pages/Legal'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const UiGallery = lazy(() => import('@/pages/UiGallery'))

const galleryEnabled = import.meta.env.DEV || import.meta.env.VITE_UI_GALLERY === 'true'

/** Router basename comes from VITE_BASE ("/havana-barberia/" or "/"). */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-page" aria-busy="true" />}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/reservar" element={<Booking />} />
        <Route path="/confirmacion/:token" element={<Confirmation />} />
        <Route path="/cita/:token" element={<ManageAppointment />} />
        <Route path="/lealtad/:token" element={<Loyalty />} />
        <Route path="/politicas" element={<Legal kind="policies" />} />
        <Route path="/privacidad" element={<Legal kind="privacy" />} />
        {galleryEnabled && <Route path="/__ui" element={<UiGallery />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  )
}
