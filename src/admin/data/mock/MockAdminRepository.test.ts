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

  it('owner needs the second step; a 6-digit code completes it', async () => {
    const repo = new MockAdminRepository({ storage: null })
    const s = await repo.signIn('  Dueno@Havana.test ', DEMO_PASSWORD)
    expect(s.user.role).toBe('owner')
    expect(s.mfaVerified).toBe(false)
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
