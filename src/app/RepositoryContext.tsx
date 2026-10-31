import { createContext, useContext, type ReactNode } from 'react'
import type { BookingRepository } from '@/data'

const Ctx = createContext<BookingRepository | null>(null)

export function RepositoryProvider({ repository, children }: { repository: BookingRepository; children: ReactNode }) {
  return <Ctx.Provider value={repository}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRepository(): BookingRepository {
  const repo = useContext(Ctx)
  if (!repo) throw new Error('RepositoryProvider is missing')
  return repo
}
