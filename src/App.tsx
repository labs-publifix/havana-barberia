import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Home from '@/pages/Home'

const Booking = lazy(() => import('@/pages/Booking'))
const Services = lazy(() => import('@/pages/Services'))
const Confirmation = lazy(() => import('@/pages/Confirmation'))
const ManageAppointment = lazy(() => import('@/pages/ManageAppointment'))
const Loyalty = lazy(() => import('@/pages/Loyalty'))
const Legal = lazy(() => import('@/pages/Legal'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const Unsubscribe = lazy(() => import('@/pages/Unsubscribe'))
const UiGallery = lazy(() => import('@/pages/UiGallery'))
const AdminApp = lazy(() => import('@/admin/AdminApp'))
const BookingSoon = lazy(() => import('@/pages/BookingSoon'))

/**
 * Online booking against the real database opens with its Edge Functions
 * (hito 1C, entrega 3). Until then the real build shows "abre muy pronto";
 * the demo keeps the full flow.
 */
const bookingOpen = import.meta.env.VITE_DATA_SOURCE !== 'supabase' || import.meta.env.VITE_BOOKING_OPEN === 'true'

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
        <Route path="/servicios" element={<Services />} />
        <Route path="/reservar" element={bookingOpen ? <Booking /> : <BookingSoon />} />
        <Route path="/confirmacion/:token" element={bookingOpen ? <Confirmation /> : <BookingSoon />} />
        <Route path="/cita/:token" element={bookingOpen ? <ManageAppointment /> : <BookingSoon />} />
        <Route path="/lealtad/:token" element={bookingOpen ? <Loyalty /> : <BookingSoon />} />
        <Route path="/politicas" element={<Legal kind="policies" />} />
        <Route path="/privacidad" element={<Legal kind="privacy" />} />
        <Route path="/baja/:token" element={<Unsubscribe />} />
        <Route path="/admin/*" element={<AdminApp />} />
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
