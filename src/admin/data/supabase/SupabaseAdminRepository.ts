import type {
  Appointment,
  BookingPolicy,
  Customer,
  ID,
  LocalDate,
  LoyaltyCard,
  PaymentMethod,
  Product,
  Service,
  ServiceCategory,
  Slot,
  Staff,
  StaffCommission,
  TimeBlock,
} from '@/domain/types'
import type { SlotQuery } from '@/data'
import { InvalidRequestError } from '@/data/errors'
import {
  fromPolicy,
  toCategory,
  toPolicy,
  toService,
  toStaff,
  type CategoryRow,
  type ServiceRow,
  type SettingsRow,
  type StaffRow,
} from '@/data/supabase/rows'
import { localDate } from '@/lib/time'
import { policyError } from '@/lib/policy'
import { scheduleErrors, DAY_NAMES } from '@/lib/schedule'
import { must, supabase } from '@/lib/supabase'
import { business } from '@/config/business'
import type {
  AdminCatalog,
  AdminChange,
  AdminFinance,
  AdminNewAppointment,
  AdminRole,
  AdminSession,
  AdminSettings,
  AdminTeam,
  AdminUser,
  AgendaDay,
  CashDay,
  NewBlock,
  PaymentInput,
  PolicyInput,
  ProductInput,
  ServiceInput,
  StaffInput,
  StaffStatusChange,
  StatusChangeResult,
  UserInput,
} from '../../domain'
import type { CustomerSummary } from '../../customers/model'
import {
  defaultFinanceSettings,
  financeSettingsError,
  type Advance,
  type BonusAward,
  type BonusRule,
  type CashMove,
  type CommissionVersion,
  type DailyClose,
  type FinanceSettings,
  type PayrollClose,
  type ProductSale,
} from '../../finance'
import { InvalidCredentialsError, InvalidMfaCodeError, type AdminRepository } from '../AdminRepository'

/** Sections already connected to Supabase (entrega 1 of hito 1C). */
const AVAILABLE = ['inicio', 'catalogo', 'equipo', 'ajustes', 'componentes'] as const

class ComingSoonError extends InvalidRequestError {
  constructor() {
    super('Esta parte del panel se conecta a la base de datos en la siguiente entrega.')
  }
}
const soon = <T>(): Promise<T> => Promise.reject(new ComingSoonError())

interface ProfileRow {
  id: string
  name: string
  email: string
  role: AdminRole
  staff_id: string | null
  active: boolean
}
interface CommissionRow {
  staff_id: string
  valid_from: string
  mode: 'percent' | 'fixed'
  value: number | null
  overrides: Record<string, number>
}
interface ProductRow {
  id: string
  name: string
  brand: string
  price: number
  image_url: string | null
  active: boolean
  created_at: string
}
interface BlockRow {
  id: string
  staff_id: string | null
  starts_at: string
  ends_at: string
  reason: string
}

const toUser = (p: ProfileRow): AdminUser => ({
  id: p.id,
  name: p.name,
  email: p.email,
  role: p.role,
  staffId: p.staff_id,
  // Decision of the shop: everyone signs in with e-mail and password only (no second step).
  mfaRequired: false,
  active: p.active,
})

const toVersion = (r: CommissionRow): CommissionVersion => ({
  staffId: r.staff_id,
  validFrom: r.valid_from,
  mode: r.mode,
  value: r.value,
  overrides: r.overrides ?? {},
})

const toBlock = (r: BlockRow): TimeBlock => ({
  id: r.id,
  staffId: r.staff_id,
  startsAt: new Date(r.starts_at).toISOString(),
  endsAt: new Date(r.ends_at).toISOString(),
  reason: r.reason,
})

/** Database errors as messages people understand. */
function friendly(e: unknown): never {
  const err = e as { message?: string; code?: string }
  const msg = err?.message ?? ''
  if (err?.code === '23505') throw new InvalidRequestError('Ya existe uno con ese nombre.')
  if (err?.code === '23503') throw new InvalidRequestError('Está en uso: ocúltalo en lugar de borrarlo.')
  if (err?.code === '42501' || /row-level security/i.test(msg))
    throw new InvalidRequestError('Tu rol no permite hacer este cambio.')
  if (
    /[áéíóúñ]/i.test(msg) ||
    msg.startsWith('No ') ||
    msg.startsWith('Debe') ||
    msg.startsWith('Esa') ||
    msg.startsWith('La ')
  )
    throw new InvalidRequestError(msg)
  throw new InvalidRequestError('No se pudo guardar. Intenta de nuevo.')
}

const today = () => localDate(new Date(), business.hours.timeZone)

/**
 * The panel against Supabase. Auth is Supabase Auth (password + TOTP for owner
 * and manager); every read and write is checked again by row-level security,
 * so the screen can never see more than the role allows. Agenda, customers and
 * finance connect in the next delivery; they say so instead of failing.
 */
export class SupabaseAdminRepository implements AdminRepository {
  readonly available = AVAILABLE

  private get db() {
    return supabase()
  }

  // ── Session ─────────────────────────────────────────────────────────────
  async getSession(): Promise<AdminSession | null> {
    const { data } = await this.db.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return null
    const { data: p } = await this.db.from('profiles').select('*').eq('id', uid).maybeSingle<ProfileRow>()
    if (!p || !p.active) return null
    const user = toUser(p)
    let mfaVerified = true
    if (user.mfaRequired) {
      const { data: aal } = await this.db.auth.mfa.getAuthenticatorAssuranceLevel()
      mfaVerified = aal?.currentLevel === 'aal2'
    }
    return { user, mfaVerified }
  }

  async signIn(email: string, password: string): Promise<AdminSession> {
    const { error } = await this.db.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) throw new InvalidCredentialsError()
    const s = await this.getSession()
    if (!s) {
      await this.db.auth.signOut()
      throw new InvalidCredentialsError()
    }
    return s
  }

  /** Pending TOTP factor while enrolling (verified with the first code). */
  private enrolling: string | null = null

  async mfaEnrollment(): Promise<{ qrCode: string; secret: string } | null> {
    const { data } = await this.db.auth.mfa.listFactors()
    if (data?.totp.some((f) => f.status === 'verified')) return null
    for (const f of data?.all ?? []) if (f.status !== 'verified') await this.db.auth.mfa.unenroll({ factorId: f.id })
    const { data: enrolled, error } = await this.db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Havana ${Date.now().toString(36)}`,
      issuer: 'Havana Barbería',
    })
    if (error || !enrolled) throw new InvalidRequestError('No se pudo preparar la verificación en dos pasos.')
    this.enrolling = enrolled.id
    return { qrCode: enrolled.totp.qr_code, secret: enrolled.totp.secret }
  }

  async verifyMfa(code: string): Promise<AdminSession> {
    if (!/^\d{6}$/.test(code)) throw new InvalidMfaCodeError()
    let factorId = this.enrolling
    if (!factorId) {
      const { data } = await this.db.auth.mfa.listFactors()
      factorId = data?.totp.find((f) => f.status === 'verified')?.id ?? null
    }
    if (!factorId) throw new InvalidMfaCodeError()
    const { error } = await this.db.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) throw new InvalidMfaCodeError()
    this.enrolling = null
    const s = await this.getSession()
    if (!s) throw new InvalidCredentialsError()
    return s
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut()
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}admin/contrasena`,
    })
  }

  async setPassword(password: string): Promise<void> {
    if (password.length < 10) throw new InvalidRequestError('Usa al menos 10 caracteres.')
    const { error } = await this.db.auth.updateUser({ password })
    if (error) throw new InvalidRequestError('No se pudo guardar la contraseña. Pide un enlace nuevo.')
  }

  // ── Users ───────────────────────────────────────────────────────────────
  async listUsers(): Promise<AdminUser[]> {
    const rows = must<ProfileRow[]>(await this.db.from('profiles').select('*').order('created_at'))
    return rows.map(toUser)
  }

  async saveUser(input: UserInput): Promise<AdminUser> {
    if (!input.id) {
      const { data, error } = await this.db.functions.invoke('invite-user', {
        body: {
          name: input.name,
          email: input.email,
          role: input.role,
          staffId: input.staffId,
          redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}admin/contrasena`,
        },
      })
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new InvalidRequestError(body?.error ?? 'No se pudo enviar la invitación.')
      }
      return toUser(data.user as ProfileRow)
    }
    const res = await this.db
      .from('profiles')
      .update({
        name: input.name.trim(),
        role: input.role,
        staff_id: input.role === 'barber' ? input.staffId : null,
        active: input.active,
      })
      .eq('id', input.id)
      .select()
      .single<ProfileRow>()
    if (res.error) friendly(res.error)
    return toUser(res.data!)
  }

  // ── Catalog ─────────────────────────────────────────────────────────────
  async getCatalog(): Promise<AdminCatalog> {
    const [cats, services, staff, links] = await Promise.all([
      this.db.from('categories').select('*').order('sort'),
      this.db.from('services').select('*').order('sort'),
      this.db.from('staff').select('*').order('sort'),
      this.db.from('staff_services').select('staff_id, service_id'),
    ])
    const l = must<{ staff_id: string; service_id: string }[]>(links)
    const categories = must<CategoryRow[]>(cats).map(toCategory)
    const order = new Map(categories.map((c) => [c.id, c.order]))
    const all = must<ServiceRow[]>(services)
      .map(toService)
      .sort((a, b) => (order.get(a.categoryId) ?? 99) - (order.get(b.categoryId) ?? 99) || a.order - b.order)
    const team = must<StaffRow[]>(staff).map((r) => toStaff(r, l))
    const staffFor: Record<ID, ID[]> = {}
    for (const s of all)
      staffFor[s.id] = team.filter((t) => t.serviceIds === 'all' || t.serviceIds.includes(s.id)).map((t) => t.id)
    // Appointments arrive in the next delivery; until then no service is in use.
    return { categories, services: all, staff: team, staffFor, usage: {} }
  }

  async saveService(input: ServiceInput): Promise<Service> {
    const name = input.name.trim()
    if (!name) throw new InvalidRequestError('Escribe el nombre del servicio.')
    if (input.active && !input.staffIds.length)
      throw new InvalidRequestError('Un servicio visible necesita al menos un barbero.')
    const row = {
      category_id: input.categoryId,
      name,
      description: input.description.trim(),
      duration_min: input.durationMin,
      price: input.price,
      loyalty_eligible: input.loyaltyEligible,
      active: input.active,
    }
    let saved: ServiceRow
    if (input.id) {
      const res = await this.db.from('services').update(row).eq('id', input.id).select().single<ServiceRow>()
      if (res.error) friendly(res.error)
      saved = res.data!
    } else {
      const max = must<{ sort: number }[]>(
        await this.db
          .from('services')
          .select('sort')
          .eq('category_id', input.categoryId)
          .order('sort', { ascending: false })
          .limit(1),
      )
      const res = await this.db
        .from('services')
        .insert({ ...row, sort: (max[0]?.sort ?? 0) + 1 })
        .select()
        .single<ServiceRow>()
      if (res.error) friendly(res.error)
      saved = res.data!
    }
    await this.syncPerformers(saved.id, input.staffIds)
    return toService(saved)
  }

  /** Who performs a service: barbers with "all" become explicit lists when they lose one. */
  private async syncPerformers(serviceId: ID, staffIds: ID[]) {
    const [staffRes, linksRes, servicesRes] = await Promise.all([
      this.db.from('staff').select('id, all_services'),
      this.db.from('staff_services').select('staff_id, service_id'),
      this.db.from('services').select('id'),
    ])
    const staff = must<{ id: string; all_services: boolean }[]>(staffRes)
    const links = must<{ staff_id: string; service_id: string }[]>(linksRes)
    const serviceIds = must<{ id: string }[]>(servicesRes).map((s) => s.id)
    for (const s of staff) {
      const wants = staffIds.includes(s.id)
      const has = s.all_services || links.some((l) => l.staff_id === s.id && l.service_id === serviceId)
      if (wants === has) continue
      if (wants) {
        must(await this.db.from('staff_services').insert({ staff_id: s.id, service_id: serviceId }))
      } else if (s.all_services) {
        const rows = serviceIds.filter((id) => id !== serviceId).map((id) => ({ staff_id: s.id, service_id: id }))
        must(await this.db.from('staff_services').upsert(rows, { ignoreDuplicates: true }))
        must(await this.db.from('staff').update({ all_services: false }).eq('id', s.id))
      } else {
        must(await this.db.from('staff_services').delete().eq('staff_id', s.id).eq('service_id', serviceId))
      }
    }
  }

  async deleteService(id: ID): Promise<void> {
    const res = await this.db.from('services').delete().eq('id', id)
    if (res.error) friendly(res.error)
  }

  async moveService(id: ID, dir: -1 | 1): Promise<void> {
    const s = must<ServiceRow>(await this.db.from('services').select('*').eq('id', id).single())
    const list = must<ServiceRow[]>(
      await this.db.from('services').select('*').eq('category_id', s.category_id).order('sort'),
    )
    await this.swap(
      'services',
      list,
      list.findIndex((x) => x.id === id),
      dir,
    )
  }

  async saveCategory(input: { id?: ID; name: string }): Promise<ServiceCategory> {
    const name = input.name.trim()
    if (!name) throw new InvalidRequestError('Escribe el nombre de la categoría.')
    if (input.id) {
      const res = await this.db.from('categories').update({ name }).eq('id', input.id).select().single<CategoryRow>()
      if (res.error) friendly(res.error)
      return toCategory(res.data!)
    }
    const max = must<{ sort: number }[]>(
      await this.db.from('categories').select('sort').order('sort', { ascending: false }).limit(1),
    )
    const res = await this.db
      .from('categories')
      .insert({ name, sort: (max[0]?.sort ?? 0) + 1 })
      .select()
      .single<CategoryRow>()
    if (res.error) friendly(res.error)
    return toCategory(res.data!)
  }

  async moveCategory(id: ID, dir: -1 | 1): Promise<void> {
    const list = must<CategoryRow[]>(await this.db.from('categories').select('*').order('sort'))
    await this.swap(
      'categories',
      list,
      list.findIndex((x) => x.id === id),
      dir,
    )
  }

  async deleteCategory(id: ID): Promise<void> {
    const res = await this.db.from('categories').delete().eq('id', id)
    if (res.error) {
      if (res.error.code === '23503') throw new InvalidRequestError('Solo se puede borrar una categoría vacía.')
      friendly(res.error)
    }
  }

  /** Swap an item with its neighbour and renumber 1..n. */
  private async swap(table: 'services' | 'categories' | 'staff', list: { id: string }[], i: number, dir: -1 | 1) {
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j]!, list[i]!]
    for (const [k, x] of list.entries())
      must(
        await this.db
          .from(table)
          .update({ sort: k + 1 })
          .eq('id', x.id),
      )
  }

  // ── Products ────────────────────────────────────────────────────────────
  async listProducts(): Promise<Product[]> {
    const [products, costs] = await Promise.all([
      this.db.from('products').select('*').order('name'),
      this.db.from('product_costs').select('*'),
    ])
    const c = costs.error
      ? []
      : (costs.data as { product_id: string; cost: number | null; commission: number | null }[])
    return must<ProductRow[]>(products).map((p) => {
      const k = c.find((x) => x.product_id === p.id)
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        price: p.price,
        cost: k?.cost ?? null,
        commission: k?.commission ?? null,
        imageUrl: p.image_url,
        active: p.active,
        createdAt: p.created_at,
      }
    })
  }

  async saveProduct(input: ProductInput): Promise<Product> {
    const name = input.name.trim()
    if (!name) throw new InvalidRequestError('Escribe el nombre del producto.')
    const row = { name, brand: input.brand.trim(), price: input.price, image_url: input.imageUrl, active: input.active }
    const res = input.id
      ? await this.db.from('products').update(row).eq('id', input.id).select().single<ProductRow>()
      : await this.db.from('products').insert(row).select().single<ProductRow>()
    if (res.error) friendly(res.error)
    const p = res.data!
    const costs = await this.db
      .from('product_costs')
      .upsert({ product_id: p.id, cost: input.cost, commission: input.commission })
    if (costs.error) friendly(costs.error)
    return { ...input, id: p.id, name, createdAt: p.created_at }
  }

  async deleteProduct(id: ID): Promise<void> {
    const res = await this.db.from('products').delete().eq('id', id)
    if (res.error) friendly(res.error)
  }

  /** Photos stay small (resized in the browser) and live with the record for now; Storage arrives later. */
  uploadProductImage(image: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
      reader.readAsDataURL(image)
    })
  }

  uploadStaffPhoto(image: Blob): Promise<string> {
    return this.uploadProductImage(image)
  }

  // ── Team ────────────────────────────────────────────────────────────────
  async getTeam(): Promise<AdminTeam> {
    const [staff, links, versions, blocks] = await Promise.all([
      this.db.from('staff').select('*').order('sort'),
      this.db.from('staff_services').select('staff_id, service_id'),
      this.db.from('commission_versions').select('*').order('valid_from'),
      this.db.from('time_blocks').select('*').gte('ends_at', new Date().toISOString()).order('starts_at'),
    ])
    const l = must<{ staff_id: string; service_id: string }[]>(links)
    const history = (versions.error ? [] : (versions.data as CommissionRow[])).map(toVersion)
    const now = today()
    const commissions: StaffCommission[] = []
    for (const id of new Set(history.map((v) => v.staffId))) {
      const current = history.filter((v) => v.staffId === id && v.validFrom <= now).at(-1)
      if (current)
        commissions.push({ staffId: id, mode: current.mode, value: current.value, overrides: current.overrides })
    }
    return {
      staff: must<StaffRow[]>(staff).map((r) => toStaff(r, l)),
      commissions,
      commissionHistory: history,
      blocks: must<BlockRow[]>(blocks).map(toBlock),
    }
  }

  async saveStaff(input: StaffInput): Promise<{ staff: Staff; outside: Appointment[] }> {
    const name = input.name.trim().replace(/\s+/g, ' ')
    if (!name) throw new InvalidRequestError('Escribe el nombre.')
    const errors = scheduleErrors(input.schedule, business.hours.weekly)
    const first = Object.entries(errors)[0]
    if (first) throw new InvalidRequestError(`${DAY_NAMES[Number(first[0])]}: ${first[1]}`)
    const services = must<{ id: string }[]>(await this.db.from('services').select('id')).map((s) => s.id)
    const chosen = input.serviceIds.filter((id) => services.includes(id))
    if (input.active && !chosen.length)
      throw new InvalidRequestError('Un barbero activo necesita al menos un servicio.')
    const all = services.every((id) => chosen.includes(id))
    const row = {
      name,
      title: input.title.trim(),
      photo_url: input.photoUrl,
      active: input.active,
      schedule: input.schedule,
      all_services: all,
    }

    let saved: StaffRow
    if (input.id) {
      const res = await this.db.from('staff').update(row).eq('id', input.id).select().single<StaffRow>()
      if (res.error) friendly(res.error)
      saved = res.data!
    } else {
      const max = must<{ sort: number }[]>(
        await this.db.from('staff').select('sort').order('sort', { ascending: false }).limit(1),
      )
      const res = await this.db
        .from('staff')
        .insert({ ...row, sort: (max[0]?.sort ?? 0) + 1 })
        .select()
        .single<StaffRow>()
      if (res.error) friendly(res.error)
      saved = res.data!
    }
    must(await this.db.from('staff_services').delete().eq('staff_id', saved.id))
    if (!all && chosen.length)
      must(await this.db.from('staff_services').insert(chosen.map((id) => ({ staff_id: saved.id, service_id: id }))))

    if (input.commission) {
      const c = input.commission
      const max = c.mode === 'percent' ? 100 : 100000
      const ok = (v: number) => Number.isInteger(v) && v >= 0 && v <= max
      const what = c.mode === 'percent' ? 'un porcentaje de 0 a 100' : 'un monto en pesos, sin centavos'
      if (c.value !== null && !ok(c.value)) throw new InvalidRequestError(`La comisión debe ser ${what}.`)
      for (const v of Object.values(c.overrides))
        if (!ok(v)) throw new InvalidRequestError(`Cada comisión personalizada debe ser ${what}.`)
      const history = must<CommissionRow[]>(
        await this.db.from('commission_versions').select('*').eq('staff_id', saved.id).order('valid_from'),
      )
      const current = history.filter((v) => v.valid_from <= today()).at(-1)
      const same =
        !!current &&
        current.mode === c.mode &&
        current.value === c.value &&
        JSON.stringify(current.overrides ?? {}) === JSON.stringify(c.overrides)
      if (!same) {
        const from = history.length ? (input.commissionFrom ?? today()) : '0001-01-01'
        must(await this.db.from('commission_versions').delete().eq('staff_id', saved.id).gte('valid_from', from))
        const res = await this.db
          .from('commission_versions')
          .insert({ staff_id: saved.id, valid_from: from, mode: c.mode, value: c.value, overrides: c.overrides })
        if (res.error) friendly(res.error)
      }
    }
    const links = chosen.map((id) => ({ staff_id: saved.id, service_id: id }))
    return { staff: toStaff(saved, links), outside: [] }
  }

  async moveStaff(id: ID, dir: -1 | 1): Promise<void> {
    const list = must<StaffRow[]>(await this.db.from('staff').select('*').order('sort'))
    await this.swap(
      'staff',
      list,
      list.findIndex((x) => x.id === id),
      dir,
    )
  }

  async createBlock(input: NewBlock): Promise<TimeBlock> {
    const res = await this.db
      .from('time_blocks')
      .insert({
        staff_id: input.staffId,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        reason: input.reason.trim(),
      })
      .select()
      .single<BlockRow>()
    if (res.error) friendly(res.error)
    return toBlock(res.data!)
  }

  async deleteBlock(id: ID): Promise<void> {
    const res = await this.db.from('time_blocks').delete().eq('id', id)
    if (res.error) friendly(res.error)
  }

  // ── Settings ────────────────────────────────────────────────────────────
  private async settingsRow(): Promise<SettingsRow> {
    return must<SettingsRow>(await this.db.from('settings').select('*').eq('id', 1).single())
  }

  async getSettings(): Promise<AdminSettings> {
    const [row, catalog] = await Promise.all([this.settingsRow(), this.getCatalog()])
    return { policy: toPolicy(row), services: catalog.services.filter((s) => s.active) }
  }

  async savePolicy(input: PolicyInput): Promise<{ policy: BookingPolicy; cardsCompleted: number }> {
    const err = policyError({ ...input.policy, slotStepMin: 15 })
    if (err) throw new InvalidRequestError(err)
    const res = await this.db
      .from('settings')
      .update(fromPolicy(input.policy))
      .eq('id', 1)
      .select()
      .single<SettingsRow>()
    if (res.error) friendly(res.error)
    if (!res.data) throw new InvalidRequestError('Tu rol no permite hacer este cambio.')
    const active = must<{ id: string }[]>(await this.db.from('services').select('id').eq('active', true)).map(
      (s) => s.id,
    )
    const on = active.filter((id) => input.loyaltyServiceIds.includes(id))
    const off = active.filter((id) => !input.loyaltyServiceIds.includes(id))
    if (!on.length) throw new InvalidRequestError('Elige al menos un servicio que sume sello.')
    must(await this.db.from('services').update({ loyalty_eligible: true }).in('id', on))
    if (off.length) must(await this.db.from('services').update({ loyalty_eligible: false }).in('id', off))
    // Loyalty cards arrive with customers (next delivery): none to adjust yet.
    return { policy: toPolicy(res.data), cardsCompleted: 0 }
  }

  async getFinanceSettings(): Promise<FinanceSettings> {
    const [row, rules] = await Promise.all([this.settingsRow(), this.db.from('bonus_rules').select('*').order('sort')])
    const bonuses: BonusRule[] = (rules.error ? [] : (rules.data as (BonusRule & { sort: number })[])).map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      threshold: b.threshold,
      amount: b.amount,
      active: b.active,
    }))
    return {
      ...defaultFinanceSettings(),
      weekStartDay: row.week_start_day,
      cardFeePercent: row.card_fee_percent === null ? null : Number(row.card_fee_percent),
      discountCommission: row.discount_commission,
      bonuses,
    }
  }

  async saveFinanceSettings(input: FinanceSettings): Promise<FinanceSettings> {
    const err = financeSettingsError(input)
    if (err) throw new InvalidRequestError(err)
    const res = await this.db
      .from('settings')
      .update({
        week_start_day: input.weekStartDay,
        card_fee_percent: input.cardFeePercent,
        discount_commission: input.discountCommission,
      })
      .eq('id', 1)
      .select()
      .single()
    if (res.error || !res.data) friendly(res.error ?? { code: '42501' })
    const existing = must<{ id: string }[]>(await this.db.from('bonus_rules').select('id')).map((b) => b.id)
    const keep = input.bonuses.map((b) => b.id)
    const removed = existing.filter((id) => !keep.includes(id))
    if (removed.length) must(await this.db.from('bonus_rules').delete().in('id', removed))
    if (input.bonuses.length) {
      const up = await this.db.from('bonus_rules').upsert(
        input.bonuses.map((b, i) => ({
          id: b.id,
          name: b.name.trim(),
          kind: b.kind,
          threshold: b.kind === 'manual' ? null : b.threshold,
          amount: b.amount,
          active: b.active,
          sort: i + 1,
        })),
      )
      if (up.error) friendly(up.error)
    }
    return this.getFinanceSettings()
  }

  /** Live updates (Supabase Realtime) arrive with the agenda. */
  subscribe(_listener: (change: AdminChange) => void): () => void {
    return () => {}
  }

  // ── Next delivery (agenda, customers, sales, cash, payroll) ─────────────
  getAgendaDay(_date: LocalDate): Promise<AgendaDay> {
    return soon()
  }
  getAvailableSlots(_query: SlotQuery): Promise<Slot[]> {
    return soon()
  }
  setAppointmentStatus(_id: ID, _status: StaffStatusChange): Promise<StatusChangeResult> {
    return soon()
  }
  completeAppointment(_id: ID, _payment: PaymentInput): Promise<StatusChangeResult> {
    return soon()
  }
  createAppointment(_input: AdminNewAppointment): Promise<Appointment> {
    return soon()
  }
  rescheduleAppointment(_id: ID, _change: { startsAt: string; staffId: ID }): Promise<Appointment> {
    return soon()
  }
  updateAppointmentNotes(_id: ID, _notes: string): Promise<Appointment> {
    return soon()
  }
  findCustomers(_query: string): Promise<Customer[]> {
    return soon()
  }
  getLoyaltyForCustomer(_customerId: ID): Promise<LoyaltyCard | null> {
    return soon()
  }
  listCustomers(): Promise<CustomerSummary[]> {
    return soon()
  }
  getCustomer(_id: ID): Promise<{ summary: CustomerSummary; appointments: Appointment[] } | null> {
    return soon()
  }
  updateCustomer(_id: ID, _patch: { name: string; phone: string; email: string; notes: string }): Promise<Customer> {
    return soon()
  }
  getFinance(_from: LocalDate, _to: LocalDate): Promise<AdminFinance> {
    return soon()
  }
  addAdvance(_input: { staffId: ID; date: LocalDate; amount: number; note: string }): Promise<Advance> {
    return soon()
  }
  deleteAdvance(_id: ID): Promise<void> {
    return soon()
  }
  closeWeek(_weekStart: LocalDate): Promise<PayrollClose> {
    return soon()
  }
  markPaid(_weekStart: LocalDate, _staffId: ID, _paid: boolean): Promise<void> {
    return soon()
  }
  reopenWeek(_weekStart: LocalDate): Promise<void> {
    return soon()
  }
  getCashDay(_date: LocalDate): Promise<CashDay> {
    return soon()
  }
  addCashMove(_input: { date: LocalDate; kind: 'out' | 'in'; amount: number; concept: string }): Promise<CashMove> {
    return soon()
  }
  deleteCashMove(_id: ID): Promise<void> {
    return soon()
  }
  closeDay(_input: { date: LocalDate; openingFund: number; counted: number; note: string }): Promise<DailyClose> {
    return soon()
  }
  reopenDay(_date: LocalDate): Promise<void> {
    return soon()
  }
  setBonusAward(_award: BonusAward, _on: boolean): Promise<void> {
    return soon()
  }
  createSale(_input: {
    items: { productId: ID; qty: number }[]
    staffId: ID | null
    method: PaymentMethod
  }): Promise<ProductSale> {
    return soon()
  }
}
