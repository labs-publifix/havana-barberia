import type { BookingPolicy, BusinessHours } from '@/domain/types'

/**
 * Business configuration. Hours and policies live here (never in components)
 * until they move to the settings table with Supabase.
 */

const weekday = [{ start: '10:00', end: '20:30' }]

export const businessHours: BusinessHours = {
  timeZone: 'America/Mexico_City',
  weekly: [
    // TODO(confirm-sunday): AgendaPro showed Sunday Nov 1 as unavailable; confirm with the client.
    [{ start: '10:00', end: '15:00' }], // Sunday
    weekday, // Monday
    weekday,
    weekday,
    weekday,
    weekday, // Friday
    [{ start: '10:00', end: '18:00' }], // Saturday
  ],
}

export const bookingPolicy: BookingPolicy = {
  slotStepMin: 15,
  minNoticeMin: 60,
  maxAdvanceDays: 30,
  toleranceMin: 10,
  bufferMin: 0, // set to 5 to add cleanup time after each appointment
  changeCutoffMin: 240,
  maxActiveAppointmentsPerCustomer: 2,
  loyaltyGoal: 10,
  rewardValidityDays: 90,
}

const address = 'Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro.'

export const business = {
  name: 'Havana Barbería',
  tagline: 'Barbería profesional en Querétaro',
  address,
  addressLines: ['Prol. Av. Zaragoza 46, Las Plazas', '76180 Santiago de Querétaro, Qro.'],
  phoneDisplay: '442 537 7844',
  phoneHref: 'tel:+524425377844',
  // TODO(confirm-whatsapp): confirm the WhatsApp number with the client.
  whatsappHref: 'https://wa.me/524425377844',
  website: 'https://havanabarberia.com',
  directionsHref: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`Havana Barbería, ${address}`)}`,
  // TODO(google-rating): static for now; replace with the live value later.
  rating: { value: 4.8, count: 257 },
  reviewsHref: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Havana Barbería ${address}`)}`,
  hours: businessHours,
  policy: bookingPolicy,
} as const
