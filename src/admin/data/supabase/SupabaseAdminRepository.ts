import type {
  Appointment,
  AppointmentSource,
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
  SoldProduct,
  Staff,
  StaffCommission,
  TimeBlock,
  WeeklySchedule,
} from '@/domain/types'
import type { SlotQuery } from '@/data'
import { InvalidRequestError, NotFoundError, SlotUnavailableError } from '@/data/errors'
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
import { addDays, localDate, toMinutes, weekdayOf, zonedInstant } from '@/lib/time'
import { computeSlots, isActiveStatus, nearestAvailable, staffForServices, totalDuration } from '@/lib/availability'
import { normalizeMxPhone } from '@/lib/phone'
import { policyError } from '@/lib/policy'
import { daysOutsideShop, outsideShopHours, scheduleErrors, shopHoursErrors, DAY_NAMES } from '@/lib/schedule'
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
  BusinessHoursChange,
  ExpenseInput,
  ProfitData,
  CashDay,
  EmailSettings,
  NewBlock,
  PanelCustomer,
  PaymentInput,
  PolicyInput,
  SentEmail,
  ProductInput,
  ServiceInput,
  StaffInput,
  StaffStatusChange,
  StatusChangeResult,
  UserInput,
} from '../../domain'
import { summarizeCustomers, type CustomerSummary } from '../../customers/model'
import {
  defaultFinanceSettings,
  earnings,
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
import type { Expense } from '../../profit'
import { InvalidCredentialsError, InvalidMfaCodeError, type AdminRepository } from '../AdminRepository'
import { cleanEmails, isFinanceRole, isOwnerRole } from '../../domain'

/** Sections connected to Supabase. */
const AVAILABLE = [
  'inicio',
  'agenda',
  'clientes',
  'ventas',
  'catalogo',
  'equipo',
  'comisiones',
  'cierre',
  'utilidades',
  'reportes',
  'ajustes',
  'componentes',
] as const

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
          password: input.password,
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

  /** Photos (already resized in the browser) go to the public `photos` bucket. */
  private async uploadPhoto(folder: 'products' | 'staff', image: Blob): Promise<string> {
    const ext = image.type === 'image/png' ? 'png' : image.type === 'image/jpeg' ? 'jpg' : 'webp'
    const path = `${folder}/${crypto.randomUUID()}.${ext}`
    const { error } = await this.db.storage
      .from('photos')
      .upload(path, image, { contentType: image.type || 'image/webp', cacheControl: '31536000', upsert: false })
    if (error) throw new InvalidRequestError('No se pudo subir la foto. Intenta de nuevo.')
    return this.db.storage.from('photos').getPublicUrl(path).data.publicUrl
  }

  uploadProductImage(image: Blob): Promise<string> {
    return this.uploadPhoto('products', image)
  }

  uploadStaffPhoto(image: Blob): Promise<string> {
    return this.uploadPhoto('staff', image)
  }

  // ── Team ────────────────────────────────────────────────────────────────
  async getTeam(): Promise<AdminTeam> {
    const [staff, links, versions, blocks, contacts] = await Promise.all([
      this.db.from('staff').select('*').order('sort'),
      this.db.from('staff_services').select('staff_id, service_id'),
      this.db.from('commission_versions').select('*').order('valid_from'),
      this.db.from('time_blocks').select('*').gte('ends_at', new Date().toISOString()).order('starts_at'),
      this.db.from('staff_contacts').select('staff_id, email'),
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
      // Archived barbers stay in the database for history but leave Equipo.
      staff: must<StaffRow[]>(staff)
        .map((r) => toStaff(r, l))
        .filter((s) => !s.archived),
      commissions,
      commissionHistory: history,
      blocks: must<BlockRow[]>(blocks).map(toBlock),
      // Only owner, developer and manager can read them (RLS); others get none.
      emails: Object.fromEntries(
        (contacts.error ? [] : (contacts.data as { staff_id: string; email: string }[])).map((c) => [
          c.staff_id,
          c.email,
        ]),
      ),
    }
  }

  async deleteStaff(id: ID): Promise<'deleted' | 'archived'> {
    const { data, error } = await this.db.rpc('delete_staff', { p_id: id })
    if (error) friendly(error)
    return data as 'deleted' | 'archived'
  }

  async saveStaff(input: StaffInput): Promise<{ staff: Staff; outside: Appointment[] }> {
    const name = input.name.trim().replace(/\s+/g, ' ')
    if (!name) throw new InvalidRequestError('Escribe el nombre.')
    const errors = scheduleErrors(input.schedule, (await this.settingsRow()).business_hours)
    const first = Object.entries(errors)[0]
    if (first) throw new InvalidRequestError(`${DAY_NAMES[Number(first[0])]}: ${first[1]}`)
    const services = must<{ id: string }[]>(await this.db.from('services').select('id')).map((s) => s.id)
    const chosen = input.serviceIds.filter((id) => services.includes(id))
    if (input.active && !chosen.length)
      throw new InvalidRequestError('Un barbero activo necesita al menos un servicio.')
    const all = services.every((id) => chosen.includes(id))
    const email = input.email?.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new InvalidRequestError('Revisa el correo del barbero.')
    const bio = input.bio.trim()
    if (bio.length > 280) throw new InvalidRequestError('La descripción admite hasta 280 caracteres.')
    const row = {
      name,
      title: input.title.trim(),
      bio,
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
    if (email !== undefined)
      must(
        await this.db
          .from('staff_contacts')
          .upsert({ staff_id: saved.id, email, updated_at: new Date().toISOString() }),
      )
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

  async getCalendarLink(staffId: ID | null, reset = false): Promise<string> {
    const { data, error } = await this.db.rpc('calendar_feed', { p_staff_id: staffId, p_reset: reset })
    if (error) friendly(error)
    const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
    return `${base}/functions/v1/calendar?t=${data as string}`
  }

  async saveBusinessHours(weekly: WeeklySchedule): Promise<BusinessHoursChange> {
    const clean = Array.from({ length: 7 }, (_, d) =>
      [...(weekly[d] ?? [])].sort((a, b) => a.start.localeCompare(b.start)),
    )
    const errors = shopHoursErrors(clean)
    const first = Object.entries(errors)[0]
    if (first)
      throw new InvalidRequestError(Number(first[0]) < 0 ? first[1] : `${DAY_NAMES[Number(first[0])]}: ${first[1]}`)
    const res = await this.db
      .from('settings')
      .update({ business_hours: clean, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select('id')
      .maybeSingle()
    if (res.error) friendly(res.error)
    if (!res.data) throw new InvalidRequestError('Tu rol no permite cambiar el horario.')
    const now = new Date()
    const [{ staff }, upcoming] = await Promise.all([
      this.teamAndServices(),
      this.db
        .from('appointments')
        .select(APPT)
        .in('status', ['booked', 'confirmed'])
        .gte('starts_at', now.toISOString())
        .order('starts_at'),
    ])
    return {
      weekly: clean,
      staffOutside: staff
        .filter((s) => s.active)
        .map((s) => ({ id: s.id, name: s.name, days: daysOutsideShop(s.schedule, clean) }))
        .filter((s) => s.days.length),
      appointmentsOutside: outsideShopHours(must<AppointmentRow[]>(upcoming).map(toAppointment), clean, TZ, now),
    }
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

  async getEmailSettings(): Promise<EmailSettings> {
    const [row, recent] = await Promise.all([
      this.settingsRow(),
      this.db.from('email_outbox').select('*').order('id', { ascending: false }).limit(30),
    ])
    return {
      customerEmails: !!(row as SettingsRow & { customer_emails?: boolean }).customer_emails,
      teamEmails: (row as SettingsRow & { team_emails?: string[] }).team_emails ?? [],
      recent: (recent.error ? [] : (recent.data as OutboxRow[])).map((r) => ({
        id: String(r.id),
        kind: r.kind,
        status: r.status,
        to: r.to_email,
        subject: r.subject,
        error: r.error,
        createdAt: r.created_at,
        sentAt: r.sent_at,
      })),
    }
  }

  async setTeamEmails(emails: string[]): Promise<string[]> {
    const list = cleanEmails(emails)
    const res = await this.db.from('settings').update({ team_emails: list }).eq('id', 1).select('id').maybeSingle()
    if (res.error) friendly(res.error)
    if (!res.data) throw new InvalidRequestError('Tu rol no permite hacer este cambio.')
    return list
  }

  async setCustomerEmails(on: boolean): Promise<void> {
    const res = await this.db.from('settings').update({ customer_emails: on }).eq('id', 1).select('id').maybeSingle()
    if (res.error) friendly(res.error)
    if (!res.data) throw new InvalidRequestError('Tu rol no permite hacer este cambio.')
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

  // ── Live updates (Supabase Realtime) ─────────────────────────────────────
  /** Any change to appointments, payments or blocks refreshes the panel; new ones are announced. */
  subscribe(listener: (change: AdminChange) => void): () => void {
    const channel = this.db
      .channel('panel-agenda')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (e) => {
        if (e.eventType !== 'INSERT') return listener({ created: [] })
        void this.appointment((e.new as { id: string }).id)
          .then((a) => listener({ created: a ? [a] : [] }))
          .catch(() => listener({ created: [] }))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => listener({ created: [] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_blocks' }, () => listener({ created: [] }))
      .subscribe()
    return () => void this.db.removeChannel(channel)
  }

  // ── Agenda ──────────────────────────────────────────────────────────────
  private async appointment(id: ID): Promise<Appointment | null> {
    const res = await this.db.from('appointments').select(APPT).eq('id', id).maybeSingle<AppointmentRow>()
    if (res.error) friendly(res.error)
    return res.data ? toAppointment(res.data) : null
  }

  /** Appointments starting between two instants (with customer contact and payment). */
  private async appointmentsBetween(fromIso: string, toIso: string): Promise<Appointment[]> {
    const rows = must<AppointmentRow[]>(
      await this.db
        .from('appointments')
        .select(APPT)
        .gte('starts_at', fromIso)
        .lt('starts_at', toIso)
        .order('starts_at'),
    )
    return rows.map(toAppointment)
  }

  private async blocksBetween(fromIso: string, toIso: string): Promise<TimeBlock[]> {
    const rows = must<BlockRow[]>(
      await this.db.from('time_blocks').select('*').lt('starts_at', toIso).gt('ends_at', fromIso).order('starts_at'),
    )
    return rows.map(toBlock)
  }

  private async teamAndServices(): Promise<{ staff: Staff[]; services: Service[] }> {
    const [staff, links, services] = await Promise.all([
      this.db.from('staff').select('*').order('sort'),
      this.db.from('staff_services').select('staff_id, service_id'),
      this.db.from('services').select('*').order('sort'),
    ])
    const l = must<{ staff_id: string; service_id: string }[]>(links)
    return {
      staff: must<StaffRow[]>(staff).map((r) => toStaff(r, l)),
      services: must<ServiceRow[]>(services).map(toService),
    }
  }

  async getAgendaDay(date: LocalDate): Promise<AgendaDay> {
    const dayStart = zonedInstant(date, '00:00', TZ).toISOString()
    const dayEnd = zonedInstant(date, '23:59', TZ).toISOString()
    const next = zonedInstant(addDays(date, 1), '00:00', TZ).toISOString()
    const [{ staff, services }, appointments, blocks, row] = await Promise.all([
      this.teamAndServices(),
      this.appointmentsBetween(dayStart, next),
      this.blocksBetween(dayStart, next),
      this.settingsRow(),
    ])
    return {
      date,
      timeZone: TZ,
      hours: row.business_hours[weekdayOf(date)] ?? [],
      staff: staff.filter((s) => s.active),
      services,
      appointments,
      // Multi-day time off is clipped to this day, like the demo.
      blocks: blocks.map((b) => ({
        ...b,
        startsAt: b.startsAt < dayStart ? dayStart : b.startsAt,
        endsAt: b.endsAt > dayEnd ? dayEnd : b.endsAt,
      })),
    }
  }

  /** Staff book from now on (no minimum notice) and up to 90 days ahead. */
  async getAvailableSlots(q: SlotQuery): Promise<Slot[]> {
    const [{ staff, services }, row] = await Promise.all([this.teamAndServices(), this.settingsRow()])
    const chosen = services.filter((s) => s.active && q.serviceIds.includes(s.id))
    if (!chosen.length || chosen.length !== q.serviceIds.length) return []
    const candidates = staffForServices(staff, q.serviceIds)
    const dayStart = zonedInstant(q.date, '00:00', TZ).toISOString()
    const next = zonedInstant(addDays(q.date, 1), '00:00', TZ).toISOString()
    const [appointments, blocks] = await Promise.all([
      this.appointmentsBetween(dayStart, next),
      this.blocksBetween(dayStart, next),
    ])
    return computeSlots({
      date: q.date,
      durationMin: totalDuration(chosen),
      staff: q.staffId === 'any' ? candidates : candidates.filter((s) => s.id === q.staffId),
      hours: { timeZone: TZ, weekly: row.business_hours },
      policy: { ...toPolicy(row), minNoticeMin: 0, maxAdvanceDays: 90 },
      appointments,
      blocks,
      now: new Date(),
      excludeAppointmentId: q.excludeAppointmentId,
    })
  }

  private async loyaltyOf(customerId: ID): Promise<LoyaltyCard | null> {
    const res = await this.db
      .from('loyalty_cards')
      .select('*, customers(name)')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (res.error || !res.data) return null
    return toCard(res.data as CardRow)
  }

  async setAppointmentStatus(id: ID, status: StaffStatusChange): Promise<StatusChangeResult> {
    const a = await this.appointment(id)
    if (!a) throw new NotFoundError('esa cita')
    if (a.status !== 'booked' && a.status !== 'confirmed') throw new InvalidRequestError('Esta cita ya está cerrada.')
    if (status === 'confirmed' && a.status === 'confirmed') throw new InvalidRequestError('La cita ya está confirmada.')
    if (status === 'no_show') {
      const { toleranceMin } = toPolicy(await this.settingsRow())
      if (Date.now() < Date.parse(a.startsAt) + toleranceMin * 60000)
        throw new InvalidRequestError(`Marca no-show después de ${toleranceMin} minutos de tolerancia.`)
    }
    const res = await this.db.from('appointments').update({ status }).eq('id', id).select('id').maybeSingle()
    if (res.error) friendly(res.error)
    if (!res.data) throw new InvalidRequestError('Tu rol no permite hacer este cambio.')
    return {
      appointment: (await this.appointment(id))!,
      loyalty: await this.loyaltyOf(a.customerId),
      stampAdded: false,
    }
  }

  async completeAppointment(id: ID, payment: PaymentInput): Promise<StatusChangeResult> {
    let discount: { amount: number; reason: string; approvalId?: string } | undefined
    if (payment.discount) {
      discount = { amount: payment.discount.amount, reason: payment.discount.reason }
      if (payment.discount.authorizer) {
        const { data, error } = await this.db.functions.invoke('authorize-discount', {
          body: { ...payment.discount.authorizer, amount: payment.discount.amount },
        })
        if (error) {
          const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
          throw new InvalidRequestError(body?.error ?? 'No se pudo autorizar el descuento.')
        }
        discount.approvalId = (data as { approvalId: string }).approvalId
      }
    }
    const { data, error } = await this.db.rpc('complete_appointment', {
      p_id: id,
      p_payment: {
        method: payment.method,
        tip: payment.tip,
        tipMethod: payment.tipMethod,
        useReward: !!payment.useReward,
        splits: payment.splits ?? null,
        products: payment.products ?? [],
        ...(discount ? { discount } : {}),
      },
    })
    if (error) friendly(error)
    const a = (await this.appointment(id))!
    return {
      appointment: a,
      loyalty: await this.loyaltyOf(a.customerId),
      stampAdded: !!(data as { stampAdded?: boolean } | null)?.stampAdded,
    }
  }

  /** Find or create the customer of a panel booking (walk-ins may have no phone). */
  private async resolveCustomer(c: PanelCustomer, walkIn: boolean): Promise<Customer> {
    if ('id' in c) {
      const found = await this.db.from('customers').select('*').eq('id', c.id).maybeSingle<CustomerRow>()
      if (!found.data) throw new NotFoundError('ese cliente')
      return toCustomer(found.data)
    }
    const name = c.name.trim()
    if (!name) throw new InvalidRequestError('Escribe el nombre del cliente.')
    const phone = c.phone.trim() ? normalizeMxPhone(c.phone) : ''
    if (phone === null) throw new InvalidRequestError('Revisa el teléfono: 10 dígitos.')
    if (!phone && !walkIn) throw new InvalidRequestError('El teléfono es obligatorio para agendar.')
    const email = c.email.trim().toLowerCase()
    const filters = [phone && `phone.eq."${phone}"`, email && `email.eq."${email.replace(/"/g, '')}"`]
      .filter(Boolean)
      .join(',')
    if (filters) {
      const existing = must<CustomerRow[]>(await this.db.from('customers').select('*').or(filters).limit(1))
      if (existing[0]) return toCustomer(existing[0])
    }
    const res = await this.db.from('customers').insert({ name, phone, email }).select().single<CustomerRow>()
    if (res.error) friendly(res.error)
    return toCustomer(res.data!)
  }

  async createAppointment(input: AdminNewAppointment): Promise<Appointment> {
    const { staff, services } = await this.teamAndServices()
    const chosen = services.filter((s) => s.active && input.serviceIds.includes(s.id))
    if (!chosen.length || chosen.length !== input.serviceIds.length)
      throw new InvalidRequestError('Elige al menos un servicio.')
    const durationMin = totalDuration(chosen)
    const startsAt = new Date(input.startsAt).toISOString()
    const endsAt = new Date(Date.parse(startsAt) + durationMin * 60000).toISOString()
    const date = localDate(startsAt, TZ)

    let staffId: ID | null
    if (input.source === 'walk_in') {
      // Right now, with whoever is free (or the chosen barber), even off the 15-minute grid.
      const dayStart = zonedInstant(date, '00:00', TZ).toISOString()
      const next = zonedInstant(addDays(date, 1), '00:00', TZ).toISOString()
      const [day, blocks] = await Promise.all([
        this.appointmentsBetween(dayStart, next),
        this.blocksBetween(dayStart, next),
      ])
      const free = (s: Staff) =>
        isWorkingAt(s, startsAt, endsAt) &&
        !day.some(
          (a) => a.staffId === s.id && isActiveStatus(a.status) && a.startsAt < endsAt && startsAt < a.endsAt,
        ) &&
        !blocks.some((b) => (b.staffId === null || b.staffId === s.id) && b.startsAt < endsAt && startsAt < b.endsAt)
      staffId =
        staffForServices(staff, input.serviceIds).find(
          (s) => (input.staffId === 'any' || s.id === input.staffId) && free(s),
        )?.id ?? null
      if (!staffId) throw new SlotUnavailableError([])
    } else {
      const slots = await this.getAvailableSlots({ serviceIds: input.serviceIds, staffId: input.staffId, date })
      const slot = slots.find((x) => x.startsAt === startsAt)
      if (!slot?.available || !slot.staffId) throw new SlotUnavailableError(nearestAvailable(slots, startsAt))
      staffId = slot.staffId
    }

    const customer = await this.resolveCustomer(input.customer, input.source === 'walk_in')
    const card = await this.loyaltyOf(customer.id)
    const res = await this.db
      .from('appointments')
      .insert({
        customer_id: customer.id,
        staff_id: staffId,
        service_ids: chosen.map((s) => s.id),
        starts_at: startsAt,
        ends_at: endsAt,
        duration_min: durationMin,
        total_price: chosen.reduce((t, s) => t + s.price, 0),
        status: 'confirmed',
        source: input.source,
        notes: input.notes.trim(),
        loyalty_token: card?.token ?? null,
      })
      .select(APPT)
      .single<AppointmentRow>()
    if (res.error) {
      if (res.error.code === '23P01') throw new SlotUnavailableError([])
      friendly(res.error)
    }
    return toAppointment(res.data!)
  }

  async rescheduleAppointment(id: ID, change: { startsAt: string; staffId: ID }): Promise<Appointment> {
    const a = await this.appointment(id)
    if (!a) throw new NotFoundError('esa cita')
    if (a.status !== 'booked' && a.status !== 'confirmed') throw new InvalidRequestError('Esta cita ya está cerrada.')
    const date = localDate(change.startsAt, TZ)
    const slots = await this.getAvailableSlots({
      serviceIds: a.serviceIds,
      staffId: change.staffId,
      date,
      excludeAppointmentId: a.id,
    })
    const target = slots.find((x) => x.startsAt === change.startsAt)
    if (!target?.available || !target.staffId) throw new SlotUnavailableError(nearestAvailable(slots, change.startsAt))
    const res = await this.db
      .from('appointments')
      .update({ starts_at: target.startsAt, ends_at: target.endsAt, staff_id: target.staffId })
      .eq('id', id)
      .select(APPT)
      .single<AppointmentRow>()
    if (res.error) {
      if (res.error.code === '23P01') throw new SlotUnavailableError(nearestAvailable(slots, change.startsAt))
      friendly(res.error)
    }
    return toAppointment(res.data!)
  }

  async updateAppointmentNotes(id: ID, notes: string): Promise<Appointment> {
    const res = await this.db
      .from('appointments')
      .update({ notes: notes.trim() })
      .eq('id', id)
      .select(APPT)
      .single<AppointmentRow>()
    if (res.error) friendly(res.error)
    return toAppointment(res.data!)
  }

  // ── Customers ───────────────────────────────────────────────────────────
  async findCustomers(query: string): Promise<Customer[]> {
    const q = query.trim().replace(/[%,()]/g, ' ')
    if (q.length < 2) return []
    const digits = q.replace(/\D/g, '')
    const filters = [
      `name.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      ...(digits.length >= 3 ? [`phone.ilike.%${digits}%`] : []),
    ]
    const rows = must<CustomerRow[]>(
      await this.db.from('customers').select('*').or(filters.join(',')).order('name').limit(8),
    )
    return rows.map(toCustomer)
  }

  getLoyaltyForCustomer(customerId: ID): Promise<LoyaltyCard | null> {
    return this.loyaltyOf(customerId)
  }

  async listCustomers(): Promise<CustomerSummary[]> {
    const [customers, appointments, cards] = await Promise.all([
      this.db.from('customers').select('*').order('name'),
      this.db.from('appointments').select(APPT),
      this.db.from('loyalty_cards').select('*, customers(name)'),
    ])
    return summarizeCustomers(
      must<CustomerRow[]>(customers).map(toCustomer),
      must<AppointmentRow[]>(appointments).map(toAppointment),
      must<CardRow[]>(cards).map(toCard),
      new Date(),
    )
  }

  async getCustomer(id: ID): Promise<{ summary: CustomerSummary; appointments: Appointment[] } | null> {
    const found = await this.db.from('customers').select('*').eq('id', id).maybeSingle<CustomerRow>()
    if (!found.data) return null
    const [rows, card] = await Promise.all([
      this.db.from('appointments').select(APPT).eq('customer_id', id).order('starts_at', { ascending: false }),
      this.loyaltyOf(id),
    ])
    const appointments = must<AppointmentRow[]>(rows).map(toAppointment)
    const [summary] = summarizeCustomers([toCustomer(found.data)], appointments, card ? [card] : [], new Date())
    return { summary: summary!, appointments }
  }

  async updateCustomer(
    id: ID,
    patch: { name: string; phone: string; email: string; notes: string },
  ): Promise<Customer> {
    const name = patch.name.trim()
    if (!name) throw new InvalidRequestError('Escribe el nombre.')
    const phone = patch.phone.trim() ? normalizeMxPhone(patch.phone) : ''
    if (phone === null) throw new InvalidRequestError('Revisa el teléfono: 10 dígitos.')
    const email = patch.email.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidRequestError('Revisa el correo.')
    const res = await this.db
      .from('customers')
      .update({ name, phone, email, notes: patch.notes.trim() })
      .eq('id', id)
      .select()
      .single<CustomerRow>()
    if (res.error) {
      if (res.error.code === '23505') throw new InvalidRequestError('Ese teléfono o correo ya es de otro cliente.')
      friendly(res.error)
    }
    return toCustomer(res.data!)
  }

  // ── Finance ─────────────────────────────────────────────────────────────
  async getFinance(from: LocalDate, to: LocalDate): Promise<AdminFinance> {
    const start = zonedInstant(from, '00:00', TZ).toISOString()
    const end = zonedInstant(addDays(to, 1), '00:00', TZ).toISOString()
    const [{ staff, services }, appointments, team, settings, advances, sales, awards, close, paid] = await Promise.all(
      [
        this.teamAndServices(),
        this.appointmentsBetween(start, end),
        this.getTeam(),
        this.getFinanceSettings(),
        this.db.from('advances').select('*').gte('date', from).lte('date', to).order('date'),
        this.db.from('product_sales').select('*').gte('at', start).lt('at', end).order('at'),
        this.db.from('bonus_awards').select('*').gte('week_start', from).lte('week_start', to),
        this.db.from('payroll_closes').select('*').eq('week_start', from).maybeSingle(),
        this.db.from('payroll_payments').select('*').eq('week_start', from),
      ],
    )
    const closeRow = close.data as PayrollCloseRow | null
    return {
      appointments,
      services,
      staff,
      commissions: team.commissions,
      commissionHistory: team.commissionHistory,
      advances: (advances.error ? [] : (advances.data as AdvanceRow[])).map(toAdvance),
      sales: must<SaleRow[]>(sales).map(toSale),
      settings,
      bonusAwards: (awards.error ? [] : (awards.data as AwardRow[])).map((w) => ({
        weekStart: w.week_start,
        staffId: w.staff_id,
        bonusId: w.bonus_id,
      })),
      close: closeRow
        ? {
            weekStart: closeRow.week_start,
            weekEnd: closeRow.week_end,
            closedAt: closeRow.closed_at,
            closedBy: closeRow.closed_by_name,
            rows: closeRow.rows,
            paid: Object.fromEntries(
              (paid.error ? [] : (paid.data as PaidRow[])).map((p) => [
                p.staff_id,
                { at: p.paid_at, by: p.paid_by_name },
              ]),
            ),
          }
        : null,
    }
  }

  async getProfit(from: LocalDate, to: LocalDate): Promise<ProfitData> {
    const [finance, products, expenses, closes, outs] = await Promise.all([
      this.getFinance(from, to),
      this.listProducts(),
      this.db.from('expenses').select('*').gte('date', from).lte('date', to).order('date'),
      this.db.from('payroll_closes').select('*').gte('week_start', from).lte('week_start', to),
      this.db.from('cash_moves').select('*').eq('kind', 'out').gte('date', from).lte('date', to).order('date'),
    ])
    return {
      finance,
      products: products.map((p) => ({ id: p.id, name: p.name, cost: p.cost })),
      expenses: must<ExpenseRow[]>(expenses).map(toExpense),
      payrollCloses: must<PayrollCloseRow[]>(closes).map((c) => ({
        weekStart: c.week_start,
        weekEnd: c.week_end,
        closedAt: c.closed_at,
        closedBy: c.closed_by_name,
        rows: c.rows,
        paid: {},
      })),
      cashOuts: must<CashMoveRow[]>(outs).map(toMove),
    }
  }

  async addExpense(input: ExpenseInput): Promise<Expense> {
    const concept = input.concept.trim()
    if (!concept) throw new InvalidRequestError('Escribe el concepto.')
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 1000000)
      throw new InvalidRequestError('Escribe el monto en pesos, sin centavos.')
    const res = await this.db
      .from('expenses')
      .insert({
        date: input.date,
        category: input.category,
        concept,
        amount: input.amount,
        method: input.method,
        cash_move_id: input.cashMoveId ?? null,
        by_name: await this.myName(),
      })
      .select()
      .single<ExpenseRow>()
    if (res.error) {
      if (res.error.code === '23505') throw new InvalidRequestError('Esa salida de caja ya cuenta como gasto.')
      friendly(res.error)
    }
    return toExpense(res.data!)
  }

  async deleteExpense(id: ID): Promise<void> {
    const res = await this.db.from('expenses').delete().eq('id', id)
    if (res.error) friendly(res.error)
  }

  private async myName(): Promise<string> {
    return (await this.getSession())?.user.name ?? 'Panel'
  }

  async addAdvance(input: { staffId: ID; date: LocalDate; amount: number; note: string }): Promise<Advance> {
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 100000)
      throw new InvalidRequestError('Escribe el anticipo en pesos, sin centavos.')
    const res = await this.db
      .from('advances')
      .insert({ staff_id: input.staffId, date: input.date, amount: input.amount, note: input.note.trim() })
      .select()
      .single<AdvanceRow>()
    if (res.error) friendly(res.error)
    return toAdvance(res.data!)
  }

  async deleteAdvance(id: ID): Promise<void> {
    const res = await this.db.from('advances').delete().eq('id', id)
    if (res.error) friendly(res.error)
  }

  async setBonusAward(award: BonusAward, on: boolean): Promise<void> {
    const row = { week_start: award.weekStart, staff_id: award.staffId, bonus_id: award.bonusId }
    const res = on
      ? await this.db.from('bonus_awards').upsert(row, { ignoreDuplicates: true })
      : await this.db.from('bonus_awards').delete().match(row)
    if (res.error) friendly(res.error)
  }

  /** Freeze the week's receipts as they are now (owner or manager). */
  async closeWeek(weekStart: LocalDate): Promise<PayrollClose> {
    const weekEnd = addDays(weekStart, 6)
    const data = await this.getFinance(weekStart, weekEnd)
    if (data.close) throw new InvalidRequestError('Esa semana ya está cerrada.')
    const rows = earnings({
      ...data,
      bonusRules: data.settings.bonuses,
      discountCommission: data.settings.discountCommission,
      from: weekStart,
      to: weekEnd,
      timeZone: TZ,
    }).filter((r) => r.services > 0 || r.advances > 0 || r.bonusTotal > 0 || r.products > 0)
    const closedBy = await this.myName()
    const res = await this.db
      .from('payroll_closes')
      .insert({ week_start: weekStart, week_end: weekEnd, rows, closed_by_name: closedBy })
      .select()
      .single<PayrollCloseRow>()
    if (res.error) friendly(res.error)
    return { weekStart, weekEnd, closedAt: res.data!.closed_at, closedBy, rows, paid: {} }
  }

  async markPaid(weekStart: LocalDate, staffId: ID, paid: boolean): Promise<void> {
    const res = paid
      ? await this.db
          .from('payroll_payments')
          .insert({ week_start: weekStart, staff_id: staffId, paid_by_name: await this.myName() })
      : await this.db.from('payroll_payments').delete().match({ week_start: weekStart, staff_id: staffId })
    if (res.error) friendly(res.error)
  }

  async reopenWeek(weekStart: LocalDate): Promise<void> {
    const me = (await this.getSession())?.user
    if (!isOwnerRole(me?.role)) throw new InvalidRequestError('Solo el dueño puede reabrir una semana cerrada.')
    const res = await this.db.from('payroll_closes').delete().eq('week_start', weekStart)
    if (res.error) friendly(res.error)
  }

  // ── Daily cash ──────────────────────────────────────────────────────────
  async getCashDay(date: LocalDate): Promise<CashDay> {
    const start = zonedInstant(date, '00:00', TZ).toISOString()
    const end = zonedInstant(addDays(date, 1), '00:00', TZ).toISOString()
    const [paid, sales, moves, close] = await Promise.all([
      this.db.from('payments').select('appointment_id').gte('paid_at', start).lt('paid_at', end),
      this.db.from('product_sales').select('*').gte('at', start).lt('at', end).order('at'),
      this.db.from('cash_moves').select('*').eq('date', date).order('at'),
      this.db.from('daily_closes').select('*').eq('date', date).maybeSingle(),
    ])
    const ids = must<{ appointment_id: string }[]>(paid).map((p) => p.appointment_id)
    const appointments = ids.length
      ? must<AppointmentRow[]>(await this.db.from('appointments').select(APPT).in('id', ids)).map(toAppointment)
      : []
    const c = close.data as DailyCloseRow | null
    return {
      date,
      appointments,
      sales: must<SaleRow[]>(sales).map(toSale),
      moves: must<CashMoveRow[]>(moves).map(toMove),
      close: c ? toDailyClose(c) : null,
    }
  }

  async addCashMove(input: {
    date: LocalDate
    kind: 'out' | 'in'
    amount: number
    concept: string
  }): Promise<CashMove> {
    if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 1000000)
      throw new InvalidRequestError('Escribe el monto en pesos, sin centavos.')
    if (!input.concept.trim()) throw new InvalidRequestError('Escribe el concepto.')
    const res = await this.db
      .from('cash_moves')
      .insert({ ...input, concept: input.concept.trim(), by_name: await this.myName() })
      .select()
      .single<CashMoveRow>()
    if (res.error) friendly(res.error)
    return toMove(res.data!)
  }

  async deleteCashMove(id: ID): Promise<void> {
    const res = await this.db.from('cash_moves').delete().eq('id', id)
    if (res.error) friendly(res.error)
  }

  async closeDay(input: { date: LocalDate; openingFund: number; counted: number; note: string }): Promise<DailyClose> {
    const { data, error } = await this.db.rpc('close_day', {
      p_date: input.date,
      p_opening_fund: input.openingFund,
      p_counted: input.counted,
      p_note: input.note,
    })
    if (error) friendly(error)
    return toDailyClose(data as DailyCloseRow)
  }

  async reopenDay(date: LocalDate): Promise<void> {
    const me = (await this.getSession())?.user
    if (!isFinanceRole(me?.role))
      throw new InvalidRequestError('Solo el dueño o el gerente pueden reabrir una caja cerrada.')
    const res = await this.db.from('daily_closes').delete().eq('date', date)
    if (res.error) friendly(res.error)
  }

  async createSale(input: {
    items: { productId: ID; qty: number }[]
    staffId: ID | null
    method: PaymentMethod
  }): Promise<ProductSale> {
    const { data, error } = await this.db.rpc('record_sale', {
      p_items: input.items,
      p_staff_id: input.staffId,
      p_method: input.method,
    })
    if (error) friendly(error)
    return toSale(data as SaleRow)
  }
}

// ── Rows of the agenda and finance tables ───────────────────────────────────
interface ExpenseRow {
  id: string
  date: string
  category: Expense['category']
  concept: string
  amount: number
  method: Expense['method']
  cash_move_id: string | null
  by_name: string
}
const toExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  date: r.date,
  category: r.category,
  concept: r.concept,
  amount: r.amount,
  method: r.method,
  cashMoveId: r.cash_move_id,
  by: r.by_name,
})

interface OutboxRow {
  id: number
  kind: SentEmail['kind']
  status: SentEmail['status']
  to_email: string | null
  subject: string | null
  error: string | null
  created_at: string
  sent_at: string | null
}

const TZ = business.hours.timeZone
const APPT = '*, customers(name, phone, email), payments(*)'

interface PaymentRow {
  method: PaymentMethod
  amount: number
  tip: number
  tip_method: PaymentMethod
  paid_at: string
  reward_service_id: string | null
  reward_amount: number | null
  splits: { method: PaymentMethod; amount: number }[] | null
  products: SoldProduct[] | null
  discount: { amount: number; reason: string; authorizedBy: string; authorizedByName: string } | null
}
interface AppointmentRow {
  id: string
  token: string
  customer_id: string
  staff_id: string
  service_ids: string[]
  starts_at: string
  ends_at: string
  duration_min: number
  total_price: number
  status: Appointment['status']
  source: AppointmentSource
  notes: string
  loyalty_token: string | null
  created_at: string
  customers: { name: string; phone: string; email: string } | null
  payments: PaymentRow | PaymentRow[] | null
}
interface CustomerRow {
  id: string
  name: string
  phone: string
  email: string
  notes: string
  created_at: string
}
interface CardRow {
  token: string
  customer_id: string
  stamps: number
  goal: number
  reward_expires_at: string | null
  customers: { name: string } | null
}
interface AdvanceRow {
  id: string
  staff_id: string
  date: string
  amount: number
  note: string
}
interface SaleRow {
  id: string
  at: string
  items: ProductSale['items']
  staff_id: string | null
  method: PaymentMethod
  total: number
}
interface AwardRow {
  week_start: string
  staff_id: string
  bonus_id: string
}
interface PayrollCloseRow {
  week_start: string
  week_end: string
  rows: PayrollClose['rows']
  closed_by_name: string
  closed_at: string
}
interface PaidRow {
  staff_id: string
  paid_at: string
  paid_by_name: string
}
interface CashMoveRow {
  id: string
  date: string
  at: string
  kind: 'in' | 'out'
  amount: number
  concept: string
  by_name: string
}
interface DailyCloseRow {
  date: string
  opening_fund: number
  expected: number
  counted: number
  difference: number
  note: string
  closed_by_name: string
  closed_at: string
}

const iso = (t: string) => new Date(t).toISOString()

function toAppointment(r: AppointmentRow): Appointment {
  const p = Array.isArray(r.payments) ? r.payments[0] : r.payments
  return {
    id: r.id,
    token: r.token,
    customerId: r.customer_id,
    customer: {
      name: r.customers?.name ?? 'Cliente',
      phone: r.customers?.phone ?? '',
      email: r.customers?.email ?? '',
    },
    staffId: r.staff_id,
    serviceIds: r.service_ids,
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    durationMin: r.duration_min,
    totalPrice: r.total_price,
    status: r.status,
    notes: r.notes,
    createdAt: iso(r.created_at),
    loyaltyToken: r.loyalty_token,
    source: r.source,
    ...(p
      ? {
          payment: {
            method: p.method,
            amount: p.amount,
            tip: p.tip,
            tipMethod: p.tip_method,
            paidAt: iso(p.paid_at),
            ...(p.reward_service_id
              ? { rewardServiceId: p.reward_service_id, rewardAmount: p.reward_amount ?? undefined }
              : {}),
            ...(p.splits ? { splits: p.splits } : {}),
            ...(p.products ? { products: p.products } : {}),
            ...(p.discount ? { discount: p.discount } : {}),
          },
        }
      : {}),
  }
}

const toCustomer = (r: CustomerRow): Customer => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  notes: r.notes,
  createdAt: iso(r.created_at),
})

const toCard = (r: CardRow): LoyaltyCard => ({
  token: r.token,
  customerId: r.customer_id,
  customerFirstName: (r.customers?.name ?? '').split(/\s+/)[0] ?? '',
  stamps: r.stamps,
  goal: r.goal,
  rewardExpiresAt: r.reward_expires_at ? iso(r.reward_expires_at) : null,
})

const toAdvance = (r: AdvanceRow): Advance => ({
  id: r.id,
  staffId: r.staff_id,
  date: r.date,
  amount: r.amount,
  note: r.note,
})

const toSale = (r: SaleRow): ProductSale => ({
  id: r.id,
  at: iso(r.at),
  items: r.items,
  staffId: r.staff_id,
  method: r.method,
  total: r.total,
})

const toMove = (r: CashMoveRow): CashMove => ({
  id: r.id,
  date: r.date,
  at: iso(r.at),
  kind: r.kind,
  amount: r.amount,
  concept: r.concept,
  by: r.by_name,
})

const toDailyClose = (r: DailyCloseRow): DailyClose => ({
  date: r.date,
  openingFund: r.opening_fund,
  expected: r.expected,
  counted: r.counted,
  difference: r.difference,
  note: r.note,
  closedBy: r.closed_by_name,
  closedAt: iso(r.closed_at),
})

/** Inside one of the barber's shifts that day. */
function isWorkingAt(s: Staff, startsAt: string, endsAt: string) {
  const date = localDate(startsAt, TZ)
  if (localDate(endsAt, TZ) !== date) return false
  const dayStart = zonedInstant(date, '00:00', TZ).getTime()
  const from = (Date.parse(startsAt) - dayStart) / 60000
  const to = (Date.parse(endsAt) - dayStart) / 60000
  return (s.schedule[weekdayOf(date)] ?? []).some((r) => from >= toMinutes(r.start) && to <= toMinutes(r.end))
}
