import type {
  Appointment,
  Customer,
  LoyaltyCard,
  Service,
  ServiceCategory,
  Staff,
  TimeBlock,
  WeeklySchedule,
} from '@/domain/types'
import { bookingPolicy, businessHours } from '@/config/business'
import { addDays, localDate, toMinutes, weekdayOf, zonedInstant } from '@/lib/time'
import avatarIsaac from '@/assets/images/avatar-isaac.webp'
import avatarLeonardo from '@/assets/images/avatar-leonardo.webp'

/** Demo-only data. Real catalog, team and customers are captured later in the admin. */

export const DEMO_APPOINTMENT_TOKEN = 'demo-cita'
export const DEMO_LOYALTY_TOKEN = 'demo-lealtad'

export interface MockDb {
  version: number
  seededOn: string
  categories: ServiceCategory[]
  services: Service[]
  staff: Staff[]
  blocks: TimeBlock[]
  customers: Customer[]
  appointments: Appointment[]
  loyalty: LoyaltyCard[]
}

export const MOCK_DB_VERSION = 1

const categories: ServiceCategory[] = [
  { id: 'cortes', name: 'Cortes', order: 1 },
  { id: 'barba', name: 'Barba', order: 2 },
  { id: 'combos', name: 'Combos', order: 3 },
  { id: 'facial', name: 'Facial y cuidado', order: 4 },
  { id: 'color', name: 'Color', order: 5 },
]

type S = [id: string, categoryId: string, name: string, description: string, durationMin: number, price: number]
const serviceRows: S[] = [
  ['corte-adulto', 'cortes', 'Corte de cabello adulto', 'Corte a tu estilo, con acabado y peinado.', 45, 280],
  ['corte-nino', 'cortes', 'Corte de niño', 'Para menores de 10 años.', 30, 220],
  ['delineado-corte', 'cortes', 'Delineado de corte', 'Retoque de contornos entre cortes.', 30, 240],
  ['afeitado-barba', 'barba', 'Afeitado y delineado de barba', 'Afeitado con navaja y contornos definidos.', 30, 280],
  ['delineado-barba', 'barba', 'Delineado de barba', 'Perfilado limpio de la barba.', 30, 240],
  ['barba-premium', 'barba', 'Barba premium', 'Toalla caliente, perfilado, aceites y masaje.', 60, 530],
  ['bigote', 'barba', 'Arreglo de bigote', 'Recorte y forma del bigote.', 15, 150],
  ['corte-barba', 'combos', 'Corte de cabello y arreglo de barba', 'Servicio de corte + barba clásico.', 60, 500],
  ['corte-bigote', 'combos', 'Corte de cabello y arreglo de bigote', 'Corte completo y bigote en forma.', 45, 430],
  ['corte-ritual', 'combos', 'Corte de cabello y ritual facial', 'Corte con limpieza y relajación facial.', 45, 450],
  ['ritual-facial', 'facial', 'Ritual facial', 'Limpieza, exfoliación e hidratación.', 30, 320],
  ['mascarilla-negra', 'facial', 'Aplicación de mascarilla negra', 'Limpieza profunda de poros.', 15, 200],
  ['tinte-cabello', 'color', 'Tinte de cabello', 'Color uniforme o cubrimiento de canas.', 45, 275],
  ['tinte-barba', 'color', 'Tinte de barba', 'Color natural para tu barba.', 30, 220],
]

const services: Service[] = serviceRows.map(([id, categoryId, name, description, durationMin, price], i) => ({
  id,
  categoryId,
  name,
  description,
  durationMin,
  price,
  active: true,
  order: i + 1,
  loyaltyEligible: categoryId === 'cortes' || categoryId === 'combos',
}))

const r = (start: string, end: string) => ({ start, end })
const isaacSchedule: WeeklySchedule = [
  [], // Sunday off
  [r('10:00', '14:00'), r('15:00', '20:30')],
  [r('10:00', '14:00'), r('15:00', '20:30')],
  [r('10:00', '14:00'), r('15:00', '20:30')],
  [r('10:00', '14:00'), r('15:00', '20:30')],
  [r('10:00', '14:00'), r('15:00', '20:30')],
  [r('10:00', '18:00')],
]
const leonardoSchedule: WeeklySchedule = [
  [r('10:00', '15:00')],
  [], // Monday off
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '18:00')],
]

const staff: Staff[] = [
  {
    id: 'isaac',
    name: 'Isaac Fuentes',
    role: 'barber',
    photoUrl: avatarIsaac,
    active: true,
    order: 1,
    serviceIds: 'all',
    schedule: isaacSchedule,
  },
  {
    id: 'leonardo',
    name: 'Leonardo Gómez',
    role: 'barber',
    photoUrl: avatarLeonardo,
    active: true,
    order: 2,
    serviceIds: 'all',
    schedule: leonardoSchedule,
  },
]

/** Small deterministic PRNG so the demo agenda looks the same on every load of a given day. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const tz = businessHours.timeZone
const iso = (date: string, time: string) => zonedInstant(date, time, tz).toISOString()

export function createSeed(now: Date): MockDb {
  const today = localDate(now, tz)
  const rand = mulberry32(Number(today.replaceAll('-', '')))
  const createdAt = now.toISOString()

  const demoCustomer: Customer = {
    id: 'cust-demo',
    name: 'Cliente Demo',
    phone: '4420000000',
    email: 'demo@ejemplo.com',
    createdAt,
  }
  const customers: Customer[] = [demoCustomer]
  const loyalty: LoyaltyCard[] = [
    {
      token: DEMO_LOYALTY_TOKEN,
      customerId: demoCustomer.id,
      customerFirstName: 'Cliente',
      stamps: 6,
      goal: bookingPolicy.loyaltyGoal,
      rewardExpiresAt: null,
    },
  ]
  const appointments: Appointment[] = []
  const busy = new Map<string, [number, number][]>() // `${staffId}|${date}` -> minute ranges

  const fits = (s: Staff, date: string, start: number, dur: number) => {
    const ranges = s.schedule[weekdayOf(date)] ?? []
    if (!ranges.some((x) => start >= toMinutes(x.start) && start + dur <= toMinutes(x.end))) return false
    return !(busy.get(`${s.id}|${date}`) ?? []).some(([a, b]) => start < b && a < start + dur)
  }
  const add = (
    s: Staff,
    date: string,
    start: number,
    svc: Service[],
    customer: Customer,
    token: string,
    status: Appointment['status'],
  ) => {
    const dur = svc.reduce((t, x) => t + x.durationMin, 0)
    const key = `${s.id}|${date}`
    busy.set(key, [...(busy.get(key) ?? []), [start, start + dur]])
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    appointments.push({
      id: `appt-${appointments.length + 1}`,
      token,
      customerId: customer.id,
      customer: { name: customer.name, phone: customer.phone, email: customer.email },
      staffId: s.id,
      serviceIds: svc.map((x) => x.id),
      startsAt: iso(date, hhmm(start)),
      endsAt: iso(date, hhmm(start + dur)),
      durationMin: dur,
      totalPrice: svc.reduce((t, x) => t + x.price, 0),
      status,
      notes: '',
      createdAt,
      loyaltyToken: customer.id === demoCustomer.id ? DEMO_LOYALTY_TOKEN : null,
    })
  }

  // Demo appointment: the next day Isaac works, at 12:00, so /cita/demo-cita can be cancelled.
  const isaac = staff[0]!
  for (let i = 2; i < 10; i++) {
    const date = addDays(today, i)
    if (fits(isaac, date, 12 * 60, 45)) {
      add(isaac, date, 12 * 60, [services[0]!], demoCustomer, DEMO_APPOINTMENT_TOKEN, 'confirmed')
      break
    }
  }

  // Ten days of sample appointments with visible gaps.
  for (let d = 0; d < 10; d++) {
    const date = addDays(today, d)
    for (const s of staff) {
      const target = 4 + Math.floor(rand() * 5)
      for (let tries = 0, made = 0; tries < 40 && made < target; tries++) {
        const svc = services[Math.floor(rand() * services.length)]!
        const start = 10 * 60 + Math.floor(rand() * 40) * 15
        if (!fits(s, date, start, svc.durationMin)) continue
        const n = customers.length
        const customer: Customer = {
          id: `cust-${n}`,
          name: `Cliente de ejemplo ${n}`,
          phone: `44200000${String(n).padStart(2, '0')}`,
          email: `cliente${n}@ejemplo.com`,
          createdAt,
        }
        customers.push(customer)
        const past = Date.parse(iso(date, '00:00')) + (start + svc.durationMin) * 60000 < now.getTime()
        add(
          s,
          date,
          start,
          [svc],
          customer,
          `seed-${date}-${s.id}-${start}`,
          past ? 'completed' : rand() < 0.5 ? 'booked' : 'confirmed',
        )
        made++
      }
    }
  }

  // A block (e.g. training) so the agenda shows it.
  const blockDate = addDays(today, 3)
  const blocks: TimeBlock[] = [
    {
      id: 'block-1',
      staffId: 'leonardo',
      startsAt: iso(blockDate, '16:00'),
      endsAt: iso(blockDate, '18:00'),
      reason: 'Capacitación',
    },
  ]

  return {
    version: MOCK_DB_VERSION,
    seededOn: today,
    categories,
    services,
    staff,
    blocks,
    customers,
    appointments,
    loyalty,
  }
}
