import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AdminRepository } from '../data/AdminRepository'
import type { AdminSession } from '../domain'

interface AdminAuthValue {
  repo: AdminRepository
  /** undefined while the stored session loads. */
  session: AdminSession | null | undefined
  signIn(email: string, password: string): Promise<AdminSession>
  verifyMfa(code: string): Promise<AdminSession>
  signOut(): Promise<void>
  /** Demo only: enter as another user. */
  switchTo?(userId: string): Promise<AdminSession>
}

const Ctx = createContext<AdminAuthValue | null>(null)

export function AdminAuthProvider({ repository, children }: { repository: AdminRepository; children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    void repository.getSession().then((s) => alive && setSession(s))
    return () => {
      alive = false
    }
  }, [repository])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const s = await repository.signIn(email, password)
      setSession(s)
      return s
    },
    [repository],
  )
  const verifyMfa = useCallback(
    async (code: string) => {
      const s = await repository.verifyMfa(code)
      setSession(s)
      return s
    },
    [repository],
  )
  const signOut = useCallback(async () => {
    await repository.signOut()
    setSession(null)
  }, [repository])

  const demo = repository.demo
  const switchTo = useMemo(
    () =>
      demo
        ? async (userId: string) => {
            const s = await demo.switchTo(userId)
            setSession(s)
            return s
          }
        : undefined,
    [demo],
  )

  const value = useMemo(
    () => ({ repo: repository, session, signIn, verifyMfa, signOut, switchTo }),
    [repository, session, signIn, verifyMfa, signOut, switchTo],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('AdminAuthProvider is missing')
  return v
}

/** The signed-in session; only call below RequireSession. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAdminSession(): AdminSession {
  const { session } = useAdminAuth()
  if (!session) throw new Error('No admin session')
  return session
}
