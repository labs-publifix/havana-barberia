import { describe, expect, it } from 'vitest'
import type { Appointment, PaymentMethod } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import { payoutFrom, pendingTips, tipFee, tipHistory, tipPayoutsCsv, tipsByStaff, type TipPayout } from './tips'

const TZ = 'America/Mexico_City'
const rule = { fee: 5, over: 25 }
const appt = (id: string, staffId: string, date: string, tip: number, tipMethod: PaymentMethod) =>
  ({
    id,
    staffId,
    status: 'completed',
    startsAt: zonedInstant(date, '12:00', TZ),
    customer: { name: `Cliente ${id}` },
    payment: { tip, tipMethod },
  }) as unknown as Appointment
const staff = [
  { id: 'leo', name: 'Leonardo Gómez' },
  { id: 'isaac', name: 'Isaac Fuentes' },
]

describe('tips', () => {
  it('keeps $5 only from card tips over $25', () => {
    expect(tipFee(100, 'card', rule)).toBe(5)
    expect(tipFee(26, 'card', rule)).toBe(5)
    expect(tipFee(25, 'card', rule)).toBe(0)
    expect(tipFee(100, 'cash', rule)).toBe(0)
    expect(tipFee(100, 'transfer', rule)).toBe(0)
  })

  const appointments = [
    appt('a1', 'isaac', '2026-11-20', 50, 'cash'),
    appt('a2', 'isaac', '2026-11-21', 100, 'card'),
    appt('a3', 'isaac', '2026-11-21', 25, 'card'),
    appt('a4', 'leo', '2026-11-21', 30, 'transfer'),
    appt('old', 'isaac', '2026-11-01', 70, 'cash'), // before paying apart: went with the payroll
  ]

  it('adds up what each barber is owed, every payment method included', () => {
    const pending = pendingTips({ appointments, payouts: [], rule, separateFrom: '2026-11-16', timeZone: TZ })
    const [leo, isaac] = tipsByStaff(pending, staff)
    expect(leo).toMatchObject({ staffId: 'leo', amount: 30, byMethod: { cash: 0, card: 0, transfer: 30 } })
    expect(isaac).toMatchObject({ tip: 175, fee: 5, amount: 170, byMethod: { cash: 50, card: 125, transfer: 0 } })
  })

  it('a payout settles them, and a later correction leaves only the difference', () => {
    const pending = pendingTips({ appointments, payouts: [], rule, separateFrom: '2026-11-16', timeZone: TZ })
    const isaac = tipsByStaff(pending, staff).find((s) => s.staffId === 'isaac')!
    const payout = {
      ...payoutFrom(isaac),
      id: 'p1',
      folio: 1,
      staffName: 'Isaac',
      date: '2026-11-21',
      paidAt: '',
      paidBy: 'Leo',
    } as TipPayout
    expect(payout).toMatchObject({ gross: 175, fee: 5, amount: 170, firstDate: '2026-11-20', lastDate: '2026-11-21' })

    const after = pendingTips({ appointments, payouts: [payout], rule, separateFrom: '2026-11-16', timeZone: TZ })
    expect(after.filter((l) => l.staffId === 'isaac')).toEqual([])

    // The card tip was corrected from $100 to $40 after being paid: $35 paid too much.
    const corrected = appointments.map((a) => (a.id === 'a2' ? appt('a2', 'isaac', '2026-11-21', 40, 'card') : a))
    const diff = pendingTips({
      appointments: corrected,
      payouts: [payout],
      rule,
      separateFrom: '2026-11-16',
      timeZone: TZ,
    })
    expect(diff.find((l) => l.appointmentId === 'a2')).toMatchObject({ tip: -60, amount: -60 })

    // Voided payout: everything is pending again.
    const voided = { ...payout, voided: { at: '', by: 'Leo', reason: 'Error' } }
    const again = pendingTips({ appointments, payouts: [voided], rule, separateFrom: '2026-11-16', timeZone: TZ })
    expect(tipsByStaff(again, staff).find((s) => s.staffId === 'isaac')?.amount).toBe(170)
  })

  it('history by week and month, without voided payouts, and exports to CSV', () => {
    const base = {
      staffId: 'isaac',
      staffName: 'Isaac Fuentes',
      paidAt: '',
      paidBy: 'Leo',
      firstDate: '',
      lastDate: '',
      lines: [],
    }
    const p = (id: string, date: string, amount: number, voided = false) =>
      ({
        ...base,
        id,
        folio: Number(id.slice(1)),
        date,
        gross: amount,
        fee: 0,
        amount,
        byMethod: { cash: amount, card: 0, transfer: 0 },
        ...(voided ? { voided: { at: '', by: 'Leo', reason: 'Duplicado' } } : {}),
      }) as TipPayout
    const payouts = [
      p('p1', '2026-11-17', 100),
      p('p2', '2026-11-19', 50),
      p('p3', '2026-11-24', 80),
      p('p4', '2026-11-19', 999, true),
    ]
    const weeks = tipHistory(payouts, 'week', 1)
    expect(weeks.map((r) => [r.key, r.amount, r.payouts])).toEqual([
      ['2026-11-23', 80, 1],
      ['2026-11-16', 150, 2],
    ])
    expect(tipHistory(payouts, 'month', 1)).toMatchObject([
      { key: '2026-11-01', amount: 230, label: 'Noviembre de 2026' },
    ])
    const csv = tipPayoutsCsv(payouts)
    expect(csv[0]![0]).toBe('Folio')
    expect(csv.at(-1)).toContain('Anulado: Duplicado')
  })
})
