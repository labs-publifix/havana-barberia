import { describe, expect, it } from 'vitest'
import { availableSlots, formatTime } from './time'
import { DEFAULT_DATA } from '../data/defaults'
import { LocalRepository, MemoryKV, SlotTakenError } from '../data/store'
import type { Appointment } from '../data/types'

const settings = DEFAULT_DATA.settings
const barber = { ...DEFAULT_DATA.barbers[0], workDays: [0, 1, 2, 3, 4, 5, 6] }
// 2030-01-07 es lunes (10:00–20:00)
const MON = '2030-01-07'
const past = new Date(2029, 0, 1, 9, 0)

const appt = (start: string, durationMin: number, status: Appointment['status'] = 'confirmada'): Appointment => ({
  id: start,
  serviceId: 'corte',
  barberId: barber.id,
  date: MON,
  start,
  durationMin,
  price: 0,
  customerName: 'x',
  customerPhone: '1',
  notes: '',
  status,
  createdAt: '',
})

describe('availableSlots', () => {
  it('genera horarios dentro del horario de apertura', () => {
    const s = availableSlots({ date: MON, durationMin: 45, barber, settings, appointments: [], now: past })
    expect(s[0]).toBe('10:00')
    expect(s.at(-1)).toBe('19:15')
  })

  it('cerrado el domingo', () => {
    expect(availableSlots({ date: '2030-01-06', durationMin: 30, barber, settings, appointments: [], now: past })).toEqual([])
  })

  it('respeta los días de trabajo del barbero', () => {
    const b = { ...barber, workDays: [2] }
    expect(availableSlots({ date: MON, durationMin: 30, barber: b, settings, appointments: [], now: past })).toEqual([])
  })

  it('no permite traslapes con citas existentes', () => {
    const s = availableSlots({ date: MON, durationMin: 45, barber, settings, appointments: [appt('11:00', 45)], now: past })
    expect(s).toContain('10:15')
    expect(s).not.toContain('10:30')
    expect(s).not.toContain('11:30')
    expect(s).toContain('11:45')
  })

  it('las citas canceladas liberan el horario', () => {
    const s = availableSlots({ date: MON, durationMin: 45, barber, settings, appointments: [appt('11:00', 45, 'cancelada')], now: past })
    expect(s).toContain('11:00')
  })

  it('aplica la anticipación mínima el mismo día', () => {
    const now = new Date(2030, 0, 7, 12, 10)
    const s = availableSlots({ date: MON, durationMin: 30, barber, settings, appointments: [], now })
    expect(s[0]).toBe('13:15')
  })

  it('no ofrece fechas pasadas', () => {
    const now = new Date(2030, 0, 8, 9, 0)
    expect(availableSlots({ date: MON, durationMin: 30, barber, settings, appointments: [], now })).toEqual([])
  })
})

describe('LocalRepository.book', () => {
  it('rechaza un horario ya ocupado', async () => {
    const r = new LocalRepository(new MemoryKV())
    const d = await r.load()
    const b = d.barbers[0]
    const input = { serviceId: 'corte', barberId: b.id, date: '2030-01-08', start: '10:00', customerName: 'A', customerPhone: '1', notes: '' }
    const a = await r.book(input, past)
    expect(a.status).toBe('confirmada')
    expect(a.price).toBe(250)
    await expect(r.book(input, past)).rejects.toBeInstanceOf(SlotTakenError)
  })
})

it('formatTime', () => {
  expect(formatTime('13:30')).toBe('1:30 p.m.')
  expect(formatTime('00:05')).toBe('12:05 a.m.')
})
