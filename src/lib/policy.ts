import type { BookingPolicy } from '@/domain/types'

/**
 * Editable booking and loyalty rules (Ajustes). Each rule takes one of a short
 * list of values: the public texts ("hasta 4 horas antes", "10 minutos de
 * tolerancia") read well with any of them, and the backend can enforce the same
 * lists. The 15-minute grid is fixed: schedules and the agenda are built on it.
 */
export const policyOptions = {
  slotStepMin: [15, 20, 30, 45, 60],
  minNoticeMin: [30, 60, 120, 180, 240, 360, 720, 1440],
  maxAdvanceDays: [7, 14, 21, 30, 45, 60, 90],
  maxActiveAppointmentsPerCustomer: [1, 2, 3, 4, 5],
  bufferMin: [0, 5, 10, 15],
  changeCutoffMin: [120, 180, 240, 360, 720, 1440, 2880],
  toleranceMin: [5, 10, 15, 20],
  loyaltyGoal: [5, 6, 7, 8, 9, 10, 12, 15],
  rewardValidityDays: [30, 60, 90, 120, 180, 365],
} satisfies Partial<Record<keyof BookingPolicy, number[]>>

export type EditablePolicyKey = keyof typeof policyOptions

/** "30 minutos", "1 hora", "2 horas", "1 día", "2 días". */
export function durationText(min: number): string {
  if (min < 60) return `${min} minutos`
  if (min % 1440 === 0 && min >= 1440) {
    const d = min / 1440
    return d === 1 ? '1 día' : `${d} días`
  }
  const h = min / 60
  return h === 1 ? '1 hora' : `${h} horas`
}

/** First rule whose value is not one of its options, as a message to show; null when all are valid. */
export function policyError(p: BookingPolicy): string | null {
  const labels: Record<EditablePolicyKey, string> = {
    slotStepMin: 'cada cuánto se ofrecen horarios',
    minNoticeMin: 'la anticipación mínima',
    maxAdvanceDays: 'los días para reservar por adelantado',
    maxActiveAppointmentsPerCustomer: 'las citas próximas por cliente',
    bufferMin: 'el tiempo entre citas',
    changeCutoffMin: 'el plazo para cancelar o reprogramar',
    toleranceMin: 'la tolerancia',
    loyaltyGoal: 'los sellos para el premio',
    rewardValidityDays: 'la vigencia del premio',
  }
  for (const key of Object.keys(policyOptions) as EditablePolicyKey[]) {
    if (!(policyOptions[key] as number[]).includes(p[key])) return `Elige un valor válido para ${labels[key]}.`
  }
  return null
}

/** Same rules as /politicas, in one short paragraph per topic: what customers read. */
export function policySummary(p: BookingPolicy): { reservas: string; cambios: string; lealtad: string } {
  return {
    reservas: `Reservan desde ${durationText(p.minNoticeMin)} antes y hasta ${p.maxAdvanceDays} días después de hoy, con un máximo de ${p.maxActiveAppointmentsPerCustomer} ${p.maxActiveAppointmentsPerCustomer === 1 ? 'cita próxima' : 'citas próximas'} por cliente.`,
    cambios: `Cancelan o reprograman en línea hasta ${durationText(p.changeCutoffMin)} antes. Se les espera ${p.toleranceMin} minutos; después puedes marcar no-show.`,
    lealtad: `Con ${p.loyaltyGoal} sellos ganan un corte gratis, válido por ${p.rewardValidityDays} días.`,
  }
}
