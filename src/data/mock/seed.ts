import type {
  BookingPolicy,
  Appointment,
  Customer,
  LoyaltyCard,
  Product,
  Service,
  ServiceCategory,
  Staff,
  StaffCommission,
  TimeBlock,
  WeeklySchedule,
} from '@/domain/types'
import { bookingPolicy, businessHours } from '@/config/business'
import {
  defaultFinanceSettings,
  type Advance,
  type BonusAward,
  type CashMove,
  type DailyClose,
  type FinanceSettings,
  type PayrollClose,
  type ProductSale,
} from '@/admin/finance'
import { addDays, localDate, toMinutes, weekdayOf, zonedInstant } from '@/lib/time'
// Head-and-shoulders crops (120px): the tighter face crops cut the faces at small sizes.
import avatarIsaac from '@/assets/team/isaac-fuentes-card-120.webp'
import avatarLeonardo from '@/assets/team/leonardo-gomez-card-120.webp'

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
  products: Product[]
  commissions: StaffCommission[]
  /** Booking and loyalty rules, edited in Ajustes (defaults from config/business). */
  policy: BookingPolicy
  /** Advances (anticipos) given to barbers, discounted in the weekly payroll. */
  advances: Advance[]
  /** Product sales at the counter. */
  sales: ProductSale[]
  /** Payroll week, terminal fee and bonuses (Ajustes › Finanzas). */
  finance: FinanceSettings
  /** Manual bonuses marked per barber and week. */
  bonusAwards: BonusAward[]
  /** Cash taken out or put in the drawer. */
  cashMoves: CashMove[]
  /** Daily cash counts. */
  dailyCloses: DailyClose[]
  /** Closed payroll weeks (frozen receipts). */
  payrollCloses: PayrollClose[]
}

/** Bump when the demo data changes shape or content; stored demos refresh, keeping real bookings. */
export const MOCK_DB_VERSION = 7

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
    order: 2,
    serviceIds: 'all',
    schedule: isaacSchedule,
  },
  {
    id: 'leonardo',
    name: 'Leonardo Gómez',
    role: 'barber',
    photoUrl: avatarLeonardo,
    active: true,
    order: 1,
    serviceIds: 'all',
    schedule: leonardoSchedule,
  },
]

// Invented, generic names for demo customers (no real people).
const FIRST_NAMES = [
  'Carlos',
  'Jorge',
  'Miguel',
  'Andrés',
  'Ricardo',
  'Fernando',
  'Alejandro',
  'Javier',
  'Emiliano',
  'Sergio',
  'Daniel',
  'Héctor',
  'Mateo',
  'Pablo',
  'Óscar',
  'Raúl',
  'Eduardo',
  'Tomás',
  'Gerardo',
  'Manuel',
  'Roberto',
  'Adrián',
  'Mauricio',
  'Bruno',
]
const LAST_NAMES = [
  'Mendoza',
  'Ramírez',
  'Torres',
  'Herrera',
  'Castillo',
  'Vargas',
  'Navarro',
  'Ríos',
  'Salinas',
  'Cabrera',
  'Ortega',
  'Delgado',
  'Fuentes',
  'Rosales',
  'Aguilar',
  'Campos',
  'Valdez',
  'Ibarra',
  'Molina',
  'Peña',
]
/** Unique for the first 480 customers: the surname shifts every full round of first names. */
const demoName = (n: number) =>
  `${FIRST_NAMES[(n * 7) % FIRST_NAMES.length]} ${LAST_NAMES[(n * 11 + Math.floor(n / FIRST_NAMES.length) * 3) % LAST_NAMES.length]}`

const REGULAR_NOTES = [
  'Prefiere degradado bajo y tijera arriba.',
  'Alérgico a la loción con alcohol.',
  'Llega 10 min antes; ofrecerle café.',
]

/**
 * Generic demo products: invented names and prices; cost and commission are
 * left empty for the owner to capture (real figures never live in this public repo).
 */
const products: Omit<Product, 'createdAt'>[] = [
  ['shampoo-cabello', 'Shampoo para cabello 250 ml', 220],
  ['shampoo-barba', 'Shampoo para barba 120 ml', 190],
  ['aceite-barba', 'Aceite para barba 30 ml', 260],
  ['cera-mate', 'Cera mate 100 g', 240],
  ['pomada-brillo', 'Pomada de brillo 100 g', 240],
  ['balsamo-after-shave', 'Bálsamo after shave 100 ml', 210],
].map(([id, name, price]) => ({
  id: id as string,
  name: name as string,
  brand: '',
  price: price as number,
  cost: null,
  commission: null,
  imageUrl: null,
  active: true,
}))

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

  // Customers: about half the appointments belong to regulars who come back.
  // Separate PRNG, so appointment days and times stay the same as before.
  const people = mulberry32(Number(today.replaceAll('-', '')) + 13)
  const regulars: Customer[] = []
  const newCustomer = (): Customer => {
    const n = customers.length
    const daysAgo = Math.floor(people() * 420)
    const c: Customer = {
      id: `cust-${n}`,
      name: demoName(n),
      phone: `442000${String(n).padStart(4, '0')}`,
      email: `cliente${n}@ejemplo.com`,
      createdAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
    }
    customers.push(c)
    return c
  }
  // Realistic reuse: nobody twice on the same day, and at most one pending
  // future appointment per regular (the policy allows two).
  const seen = new Set<string>() // `${customerId}|${date}`
  const pending = new Set<string>()
  const customerFor = (date: string, future: boolean): Customer => {
    if (regulars.length >= 6 && people() < 0.55) {
      const pool = regulars.filter((c) => !seen.has(`${c.id}|${date}`) && !(future && pending.has(c.id)))
      const c = pool[Math.floor(people() * pool.length)]
      if (c) {
        seen.add(`${c.id}|${date}`)
        if (future) pending.add(c.id)
        return c
      }
    }
    const c = newCustomer()
    seen.add(`${c.id}|${date}`)
    if (future) pending.add(c.id)
    if (regulars.length < 24 && people() < 0.5) regulars.push(c)
    return c
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
        const past = Date.parse(iso(date, '00:00')) + (start + svc.durationMin) * 60000 < now.getTime()
        const customer = customerFor(date, !past)
        // Online bookings arrive confirmed. The old booked/confirmed draw is still
        // consumed so the PRNG sequence, and every appointment after this one, stays the same.
        if (!past) rand()
        add(s, date, start, [svc], customer, `seed-${date}-${s.id}-${start}`, past ? 'completed' : 'confirmed')
        made++
      }
    }
  }

  // The previous four weeks, already served (with a few no-shows), so the agenda's week
  // view and customer histories are not empty. Separate PRNG: the days above stay as they were.
  const pastRand = mulberry32(Number(today.replaceAll('-', '')) + 7)
  for (let d = -28; d < 0; d++) {
    const date = addDays(today, d)
    for (const s of staff) {
      const target = 4 + Math.floor(pastRand() * 4)
      for (let tries = 0, made = 0; tries < 40 && made < target; tries++) {
        const svc = services[Math.floor(pastRand() * services.length)]!
        const start = 10 * 60 + Math.floor(pastRand() * 40) * 15
        if (!fits(s, date, start, svc.durationMin)) continue
        const customer = customerFor(date, false)
        add(
          s,
          date,
          start,
          [svc],
          customer,
          `seed-${date}-${s.id}-${start}`,
          pastRand() < 0.08 ? 'no_show' : 'completed',
        )
        made++
      }
    }
  }

  // Regulars carry a loyalty card: stamps from earlier visits plus the ones in the
  // seed; one has a full card with the free cut ready. A few have staff notes.
  regulars.forEach((c, i) => {
    const earned = appointments.filter(
      (a) =>
        a.customerId === c.id &&
        a.status === 'completed' &&
        a.serviceIds.some((id) => services.find((x) => x.id === id)?.loyaltyEligible),
    ).length
    const full = i === 1
    const stamps = full
      ? bookingPolicy.loyaltyGoal
      : Math.min(bookingPolicy.loyaltyGoal - 1, earned + Math.floor(people() * 8))
    const token = `seed-card-${c.id}`
    loyalty.push({
      token,
      customerId: c.id,
      customerFirstName: c.name.split(' ')[0]!,
      stamps,
      goal: bookingPolicy.loyaltyGoal,
      rewardExpiresAt: full ? iso(addDays(today, 60), '23:59') : null,
    })
    for (const a of appointments) if (a.customerId === c.id) a.loyaltyToken = token
    if (i < REGULAR_NOTES.length) c.notes = REGULAR_NOTES[i]
  })

  // Today gets a no-show and a cancellation so the admin overview has something to flag.
  const todays = appointments
    .filter((a) => localDate(a.startsAt, tz) === today && a.token.startsWith('seed-'))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const pastToday = todays.filter((a) => a.status === 'completed')
  if (pastToday.length >= 2) pastToday[1]!.status = 'no_show'
  const upcoming = todays.filter((a) => a.status === 'confirmed' && a.token.startsWith('seed-'))
  if (upcoming.length >= 2) upcoming[upcoming.length - 1]!.status = 'cancelled'

  // Served appointments carry their payment (cash, card or transfer; sometimes a
  // tip), so the daily cash count has data. Separate PRNG: nothing else moves.
  const payRand = mulberry32(Number(today.replaceAll('-', '')) + 29)
  const methods = ['cash', 'cash', 'card', 'card', 'transfer'] as const
  for (const a of appointments) {
    if (a.status !== 'completed') continue
    const method = methods[Math.floor(payRand() * methods.length)]!
    const tip = payRand() < 0.35 ? [20, 30, 50, 50, 100][Math.floor(payRand() * 5)]! : 0
    a.payment = { method, amount: a.totalPrice, tip, tipMethod: method, paidAt: a.endsAt }
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
    products: products.map((p) => ({ ...p, createdAt })),
    // Commissions are captured by the owner in the admin; nothing real lives in this repo.
    commissions: staff.map((st) => ({ staffId: st.id, mode: 'percent', value: null, overrides: {} })),
    policy: { ...bookingPolicy },
    advances: [],
    sales: [],
    finance: defaultFinanceSettings(),
    bonusAwards: [],
    cashMoves: [],
    dailyCloses: [],
    payrollCloses: [],
  }
}
