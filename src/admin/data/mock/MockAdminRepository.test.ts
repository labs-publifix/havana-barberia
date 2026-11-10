import { describe, expect, it } from 'vitest'
import { InvalidCredentialsError, InvalidMfaCodeError } from '../AdminRepository'
import { DEMO_PASSWORD, MockAdminRepository } from './MockAdminRepository'

const memoryStorage = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

describe('MockAdminRepository', () => {
  it('rejects unknown users and wrong passwords', async () => {
    const repo = new MockAdminRepository({ storage: null })
    await expect(repo.signIn('nadie@havana.test', DEMO_PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsError)
    await expect(repo.signIn('dueno@havana.test', 'otra')).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(await repo.getSession()).toBeNull()
  })

  it('owner signs in with e-mail and password only; the code check still validates format', async () => {
    const repo = new MockAdminRepository({ storage: null })
    const s = await repo.signIn('  Dueno@Havana.test ', DEMO_PASSWORD)
    expect(s.user).toMatchObject({ role: 'owner', mfaRequired: false })
    await expect(repo.verifyMfa('12a456')).rejects.toBeInstanceOf(InvalidMfaCodeError)
    expect((await repo.verifyMfa('123456')).mfaVerified).toBe(true)
  })

  it('keeps the session in storage and clears it on sign out', async () => {
    const storage = memoryStorage()
    await new MockAdminRepository({ storage }).signIn('recepcion@havana.test', DEMO_PASSWORD)
    const again = new MockAdminRepository({ storage })
    expect((await again.getSession())?.user.role).toBe('reception')
    await again.signOut()
    expect(await new MockAdminRepository({ storage }).getSession()).toBeNull()
  })

  it('demo switch enters as another user with the second step done', async () => {
    const repo = new MockAdminRepository({ storage: null })
    const s = await repo.demo.switchTo('u-manager')
    expect(s).toMatchObject({ user: { role: 'manager' }, mfaVerified: true })
    expect((await repo.getSession())?.user.id).toBe('u-manager')
  })

  it('keeps working when storage throws', async () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    const repo = new MockAdminRepository({ storage: broken })
    await repo.signIn('isaac@havana.test', DEMO_PASSWORD)
    expect((await repo.getSession())?.user.staffId).toBe('isaac')
  })
})

describe('MockAdminRepository · agenda day', () => {
  it('clips multi-day time off to each day', async () => {
    const { MockBookingRepository } = await import('@/data/mock/MockBookingRepository')
    const { createSeed } = await import('@/data/mock/seed')
    const { zonedInstant } = await import('@/lib/time')
    const tz = 'America/Mexico_City'
    const now = zonedInstant('2026-11-02', '08:00', tz)
    const booking = new MockBookingRepository({
      storage: null,
      initial: { ...createSeed(now), appointments: [], blocks: [] },
      now: () => now,
    })
    await booking.adminCreateBlock({
      staffId: 'isaac',
      startsAt: zonedInstant('2026-11-03', '00:00', tz).toISOString(),
      endsAt: zonedInstant('2026-11-06', '00:00', tz).toISOString(),
      reason: 'Vacaciones',
    })
    const repo = new MockAdminRepository({ storage: null, booking })
    const mid = await repo.getAgendaDay('2026-11-04')
    expect(mid.blocks).toEqual([
      expect.objectContaining({
        startsAt: zonedInstant('2026-11-04', '00:00', tz).toISOString(),
        endsAt: zonedInstant('2026-11-04', '23:59', tz).toISOString(),
      }),
    ])
    expect((await repo.getAgendaDay('2026-11-06')).blocks).toEqual([])
  })
})

describe('MockAdminRepository · users', () => {
  const ownerRepo = async () => {
    const repo = new MockAdminRepository({ storage: memoryStorage() })
    await repo.demo.switchTo('u-owner')
    return repo
  }

  it('the owner invites a user who can then sign in; email must be unique', async () => {
    const repo = await ownerRepo()
    const u = await repo.saveUser({
      name: ' Sofía  Ruiz ',
      email: 'Sofia@Havana.test',
      role: 'manager',
      staffId: null,
      active: true,
    })
    expect(u).toMatchObject({ name: 'Sofía Ruiz', email: 'sofia@havana.test', mfaRequired: false })
    expect((await repo.signIn('sofia@havana.test', DEMO_PASSWORD)).user.role).toBe('manager')
    await repo.demo.switchTo('u-owner')
    await expect(
      repo.saveUser({ name: 'Otra', email: 'sofia@havana.test', role: 'reception', staffId: null, active: true }),
    ).rejects.toThrow('Ya hay un usuario con ese correo.')
  })

  it('a barber needs a profile of their own', async () => {
    const repo = await ownerRepo()
    const base = { name: 'Isaac 2', email: 'isaac2@havana.test', role: 'barber' as const, active: true }
    await expect(repo.saveUser({ ...base, staffId: null })).rejects.toThrow(/perfil del barbero/)
    await expect(repo.saveUser({ ...base, staffId: 'isaac' })).rejects.toThrow('Ese barbero ya tiene un usuario.')
  })

  it('nobody demotes or deactivates themselves; deactivated users lose access', async () => {
    const repo = await ownerRepo()
    const me = (await repo.listUsers()).find((u) => u.id === 'u-owner')!
    await expect(repo.saveUser({ ...me, role: 'manager' })).rejects.toThrow(/propio rol/)
    await expect(repo.saveUser({ ...me, active: false })).rejects.toThrow(/propio rol/)
    const reception = (await repo.listUsers()).find((u) => u.id === 'u-reception')!
    await repo.saveUser({ ...reception, active: false })
    await expect(repo.signIn('recepcion@havana.test', DEMO_PASSWORD)).rejects.toBeInstanceOf(InvalidCredentialsError)
    expect(repo.demo.users.map((u) => u.id)).not.toContain('u-reception')
  })

  it('only the owner manages users', async () => {
    const repo = new MockAdminRepository({ storage: null })
    await repo.demo.switchTo('u-manager')
    await expect(
      repo.saveUser({ name: 'X', email: 'x@havana.test', role: 'reception', staffId: null, active: true }),
    ).rejects.toThrow(/Solo la persona dueña/)
  })
})

describe('MockAdminRepository · discount authorization', () => {
  it('reception needs an owner or manager password; a barber login does not authorize', async () => {
    const { MockBookingRepository } = await import('@/data/mock/MockBookingRepository')
    const { createSeed } = await import('@/data/mock/seed')
    const { zonedInstant } = await import('@/lib/time')
    let now = zonedInstant('2026-11-02', '09:00', 'America/Mexico_City')
    const booking = new MockBookingRepository({
      storage: null,
      initial: { ...createSeed(now), appointments: [], blocks: [] },
      now: () => now,
    })
    const a = await booking.createAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: zonedInstant('2026-11-02', '10:00', 'America/Mexico_City').toISOString(),
      customer: { name: 'Ana Ríos', phone: '4421112233', email: 'ana@ejemplo.com' },
      notes: '',
      privacyAccepted: true,
    })
    now = zonedInstant('2026-11-02', '11:00', 'America/Mexico_City')
    const repo = new MockAdminRepository({ storage: null, booking })
    await repo.demo.switchTo('u-reception')
    const pay = (email: string, password: string) => ({
      method: 'cash' as const,
      tip: 0,
      tipMethod: 'cash' as const,
      discount: { amount: 30, reason: 'Promo', authorizer: { email, password } },
    })
    await expect(repo.completeAppointment(a.id, pay('isaac@havana.test', DEMO_PASSWORD))).rejects.toThrow(
      /autorización no es válida/,
    )
    await expect(repo.completeAppointment(a.id, pay('gerencia@havana.test', 'mal'))).rejects.toThrow(/autorización/)
    const r = await repo.completeAppointment(a.id, pay('gerencia@havana.test', DEMO_PASSWORD))
    expect(r.appointment.payment?.discount).toMatchObject({ authorizedBy: 'u-manager', authorizedByName: 'Gerente' })
  })
})
