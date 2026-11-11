import type { Appointment, ID, LocalDate, Product, Service, Staff, StaffCommission } from '@/domain/types'
import { addDays, localDate, weekdayOf } from '@/lib/time'
import { cardFee, earnings, type CommissionVersion, type PayrollClose, type ProductSale } from './finance'

/**
 * Utilidades: what came into the shop for a period, what went to the barbers
 * and to expenses, and what was left. Pure (tested in profit.test.ts).
 *
 * - Ingresos brutos: services charged (after free cut and discounts) plus
 *   products (in tickets and at the counter). Tips belong to the barbers and
 *   are shown apart.
 * - Comisiones: the same calculation as payroll (rule in force each day).
 *   Bonuses: those of payroll weeks already closed that start in the period.
 * - Gastos: expenses registered in Utilidades, the card terminal fee (absorbed
 *   by the shop) and the cost of the products sold (when captured).
 */

export type ExpenseCategory = 'renta' | 'servicios' | 'insumos' | 'sueldos' | 'mantenimiento' | 'publicidad' | 'otros'

export const expenseCategories: Record<ExpenseCategory, string> = {
  renta: 'Renta',
  servicios: 'Luz, agua, internet y teléfono',
  insumos: 'Insumos y material',
  sueldos: 'Sueldos y apoyos',
  mantenimiento: 'Mantenimiento',
  publicidad: 'Publicidad',
  otros: 'Otros',
}

export interface Expense {
  id: ID
  date: LocalDate
  category: ExpenseCategory
  concept: string
  amount: number
  method: 'cash' | 'card' | 'transfer'
  /** Set when it came from a cash-drawer withdrawal ("Contar como gasto"). */
  cashMoveId: ID | null
  by: string
}

export interface ProfitInput {
  appointments: Appointment[]
  sales: ProductSale[]
  services: Service[]
  staff: Staff[]
  products: Pick<Product, 'id' | 'name' | 'cost'>[]
  commissions: StaffCommission[]
  commissionHistory?: CommissionVersion[]
  discountCommission?: 'list' | 'net'
  cardFeePercent: number | null
  expenses: Expense[]
  payrollCloses: PayrollClose[]
  /** Day the payroll week starts (0 = Sunday … 6 = Saturday). */
  weekStartDay: number
  from: LocalDate
  to: LocalDate
  timeZone: string
}

export interface Ranked {
  id: ID
  name: string
  count: number
  amount: number
}

export interface ProfitReport {
  services: { amount: number; count: number; commission: number }
  products: { amount: number; units: number; commission: number; cost: number; missingCost: number }
  gross: number
  tips: number
  bonuses: number
  commissions: number
  expenses: {
    total: number
    registered: number
    terminal: number
    productCost: number
    byCategory: { category: ExpenseCategory; amount: number }[]
  }
  net: number
  /** net / gross, as a whole percent (null without income). */
  margin: number | null
  /** Services done with no commission rule captured (the profit may be lower). */
  missingCommissions: number
  topServices: Ranked[]
  topProducts: Ranked[]
  barbers: { staffId: ID; name: string; services: number; products: number; commission: number }[]
  /** Payroll weeks starting in the period that are not closed yet (their bonuses are not counted). */
  openWeeks: number
}

const add = (map: Map<ID, Ranked>, id: ID, name: string, count: number, amount: number) => {
  const r = map.get(id) ?? { id, name, count: 0, amount: 0 }
  r.count += count
  r.amount += amount
  map.set(id, r)
}

const top = (map: Map<ID, Ranked>) => [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count)

export function profitReport(input: ProfitInput): ProfitReport {
  const { from, to, timeZone } = input
  const inRange = (d: LocalDate) => d >= from && d <= to
  const done = input.appointments.filter(
    (a) => a.status === 'completed' && a.payment && inRange(localDate(a.startsAt, timeZone)),
  )
  const sales = input.sales.filter((s) => inRange(localDate(s.at, timeZone)))

  // Income
  const svcMap = new Map<ID, Ranked>()
  const prodMap = new Map<ID, Ranked>()
  let servicesAmount = 0
  let servicesCount = 0
  let tips = 0
  let cardCharged = 0
  for (const a of done) {
    const p = a.payment!
    servicesAmount += p.amount
    servicesCount += a.serviceIds.length
    tips += p.tip
    // Each service's share of what was charged for the services (list price minus free cut, then the discount).
    const priced = a.serviceIds.map((id) => {
      const s = input.services.find((x) => x.id === id)
      const list = s?.price ?? 0
      return {
        id,
        name: s?.name ?? 'Servicio',
        price: list - (p.rewardServiceId === id ? (p.rewardAmount ?? list) : 0),
      }
    })
    const base = priced.reduce((t, x) => t + x.price, 0)
    for (const x of priced) add(svcMap, x.id, x.name, 1, base > 0 ? Math.round((x.price / base) * p.amount) : 0)
    const items = p.products ?? []
    for (const i of items) add(prodMap, i.productId, i.name, i.qty, i.qty * i.price)
    const charge = p.amount + items.reduce((t, i) => t + i.qty * i.price, 0)
    cardCharged += p.splits
      ? p.splits.filter((x) => x.method === 'card').reduce((t, x) => t + x.amount, 0)
      : p.method === 'card'
        ? charge
        : 0
    if (p.tipMethod === 'card') cardCharged += p.tip
  }
  for (const s of sales) {
    for (const i of s.items) add(prodMap, i.productId, i.name, i.qty, i.qty * i.price)
    if (s.method === 'card') cardCharged += s.total
  }
  const topProducts = top(prodMap)
  const productsAmount = topProducts.reduce((t, r) => t + r.amount, 0)
  const units = topProducts.reduce((t, r) => t + r.count, 0)

  // Product cost (only where captured)
  let productCost = 0
  let missingCost = 0
  for (const r of topProducts) {
    const cost = input.products.find((p) => p.id === r.id)?.cost
    if (cost === null || cost === undefined) missingCost += r.count
    else productCost += cost * r.count
  }

  // Commissions: same as payroll, without bonuses (those come from closed weeks).
  const rows = earnings({
    appointments: input.appointments,
    services: input.services,
    staff: input.staff,
    commissions: input.commissions,
    commissionHistory: input.commissionHistory,
    discountCommission: input.discountCommission,
    sales: input.sales,
    from,
    to,
    timeZone,
  })
  let serviceCommission = 0
  for (const r of rows) for (const l of r.lines) for (const s of l.services) serviceCommission += s.commission ?? 0
  const allCommission = rows.reduce((t, r) => t + r.commission, 0)
  const productCommission = allCommission - serviceCommission
  const missingCommissions = rows.reduce((t, r) => t + r.missing, 0)

  const weeks = input.payrollCloses.filter((c) => inRange(c.weekStart))
  const bonuses = weeks.reduce((t, c) => t + c.rows.reduce((x, r) => x + r.bonusTotal, 0), 0)

  // Expenses
  const registered = input.expenses.filter((e) => inRange(e.date))
  const byCat = new Map<ExpenseCategory, number>()
  for (const e of registered) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount)
  const registeredTotal = registered.reduce((t, e) => t + e.amount, 0)
  const terminal = cardFee(cardCharged, input.cardFeePercent)
  const expensesTotal = registeredTotal + terminal + productCost

  const gross = servicesAmount + productsAmount
  const commissions = allCommission + bonuses
  const net = gross - commissions - expensesTotal

  // Payroll weeks that start in the period and are not closed yet.
  const closedStarts = new Set(weeks.map((w) => w.weekStart))
  let openWeeks = 0
  for (let d = from; d <= to; d = addDays(d, 1))
    if (weekdayOf(d) === input.weekStartDay && !closedStarts.has(d)) openWeeks++

  return {
    services: { amount: servicesAmount, count: servicesCount, commission: serviceCommission },
    products: { amount: productsAmount, units, commission: productCommission, cost: productCost, missingCost },
    gross,
    tips,
    bonuses,
    commissions,
    expenses: {
      total: expensesTotal,
      registered: registeredTotal,
      terminal,
      productCost,
      byCategory: [...byCat.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
    net,
    margin: gross > 0 ? Math.round((net / gross) * 100) : null,
    missingCommissions,
    topServices: top(svcMap),
    topProducts,
    barbers: rows
      .map((r) => {
        const prods = [
          ...sales.filter((s) => s.staffId === r.staffId).flatMap((s) => s.items),
          ...done.filter((a) => a.staffId === r.staffId).flatMap((a) => a.payment?.products ?? []),
        ].reduce((t, i) => t + i.qty * i.price, 0)
        return { staffId: r.staffId, name: r.name, services: r.sales, products: prods, commission: r.commission }
      })
      .filter((b) => b.services || b.products || b.commission),
    openWeeks,
  }
}
