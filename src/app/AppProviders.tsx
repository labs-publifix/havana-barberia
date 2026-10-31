import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import type { BookingRepository } from '@/data'
import { RepositoryProvider } from './RepositoryContext'

export function AppProviders({ repository, children }: { repository: BookingRepository; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <RepositoryProvider repository={repository}>{children}</RepositoryProvider>
    </QueryClientProvider>
  )
}
