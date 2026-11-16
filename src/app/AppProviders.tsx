import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { createQueryClient } from './queryClient'
import { useState, type ReactNode } from 'react'
import type { BookingRepository } from '@/data'
import { RepositoryProvider } from './RepositoryContext'

export function AppProviders({
  repository,
  client: given,
  children,
}: {
  repository: BookingRepository
  client?: QueryClient
  children: ReactNode
}) {
  const [client] = useState(() => given ?? createQueryClient())
  return (
    <QueryClientProvider client={client}>
      <RepositoryProvider repository={repository}>{children}</RepositoryProvider>
    </QueryClientProvider>
  )
}
