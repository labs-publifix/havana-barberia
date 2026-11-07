import { describe, expect, it } from 'vitest'
import { bookingPolicy } from '@/config/business'
import { durationText, policyError, policySummary } from './policy'

describe('policy', () => {
  it('reads durations naturally', () => {
    expect(durationText(30)).toBe('30 minutos')
    expect(durationText(60)).toBe('1 hora')
    expect(durationText(240)).toBe('4 horas')
    expect(durationText(1440)).toBe('1 día')
    expect(durationText(2880)).toBe('2 días')
  })

  it('accepts the defaults and rejects values off the lists', () => {
    expect(policyError(bookingPolicy)).toBeNull()
    expect(policyError({ ...bookingPolicy, toleranceMin: 7 })).toBe('Elige un valor válido para la tolerancia.')
    expect(policyError({ ...bookingPolicy, changeCutoffMin: 60 })).toMatch(/cancelar o reprogramar/)
    expect(policyError({ ...bookingPolicy, slotStepMin: 30 })).toBe('Los horarios van cada 15 minutos.')
  })

  it('summarizes what customers read', () => {
    const s = policySummary({ ...bookingPolicy, maxActiveAppointmentsPerCustomer: 1, changeCutoffMin: 1440 })
    expect(s.reservas).toBe(
      'Reservan desde 1 hora antes y hasta 30 días después de hoy, con un máximo de 1 cita próxima por cliente.',
    )
    expect(s.cambios).toMatch(/^Cancelan o reprograman en línea hasta 1 día antes\. Se les espera 10 minutos/)
    expect(s.lealtad).toBe('Con 10 sellos ganan un corte gratis, válido por 90 días.')
  })
})
