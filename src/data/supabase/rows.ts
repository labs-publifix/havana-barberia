import type { BookingPolicy, ID, Service, ServiceCategory, Staff, WeeklySchedule } from '@/domain/types'

/** snake_case rows from Supabase → domain types (src/domain/types.ts). */

export interface CategoryRow {
  id: string
  name: string
  sort: number
}
export interface ServiceRow {
  id: string
  category_id: string
  name: string
  description: string
  duration_min: number
  price: number
  active: boolean
  loyalty_eligible: boolean
  sort: number
}
export interface StaffRow {
  id: string
  name: string
  title: string
  photo_url: string | null
  active: boolean
  sort: number
  schedule: WeeklySchedule
  all_services: boolean
}
export interface SettingsRow {
  slot_step_min: number
  min_notice_min: number
  max_advance_days: number
  max_active_per_customer: number
  buffer_min: number
  change_cutoff_min: number
  tolerance_min: number
  loyalty_goal: number
  reward_validity_days: number
  week_start_day: number
  card_fee_percent: number | string | null
  discount_commission: 'list' | 'net'
  business_hours: WeeklySchedule
}

export const toCategory = (r: CategoryRow): ServiceCategory => ({ id: r.id, name: r.name, order: r.sort })

export const toService = (r: ServiceRow): Service => ({
  id: r.id,
  categoryId: r.category_id,
  name: r.name,
  description: r.description,
  durationMin: r.duration_min,
  price: r.price,
  active: r.active,
  order: r.sort,
  loyaltyEligible: r.loyalty_eligible,
})

export const toStaff = (r: StaffRow, links: { staff_id: string; service_id: string }[]): Staff => ({
  id: r.id,
  name: r.name,
  title: r.title || undefined,
  role: 'barber',
  photoUrl: r.photo_url,
  active: r.active,
  order: r.sort,
  serviceIds: r.all_services ? 'all' : links.filter((l) => l.staff_id === r.id).map((l) => l.service_id as ID),
  schedule: r.schedule,
})

export const toPolicy = (r: SettingsRow): BookingPolicy => ({
  slotStepMin: r.slot_step_min,
  minNoticeMin: r.min_notice_min,
  maxAdvanceDays: r.max_advance_days,
  toleranceMin: r.tolerance_min,
  bufferMin: r.buffer_min,
  changeCutoffMin: r.change_cutoff_min,
  maxActiveAppointmentsPerCustomer: r.max_active_per_customer,
  loyaltyGoal: r.loyalty_goal,
  rewardValidityDays: r.reward_validity_days,
})

export const fromPolicy = (p: BookingPolicy) => ({
  min_notice_min: p.minNoticeMin,
  max_advance_days: p.maxAdvanceDays,
  max_active_per_customer: p.maxActiveAppointmentsPerCustomer,
  buffer_min: p.bufferMin,
  change_cutoff_min: p.changeCutoffMin,
  tolerance_min: p.toleranceMin,
  loyalty_goal: p.loyaltyGoal,
  reward_validity_days: p.rewardValidityDays,
})
