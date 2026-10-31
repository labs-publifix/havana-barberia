import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import { AppRoutes } from '@/App'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed, type MockDb } from '@/data/mock/seed'

/** Render the real routes with an in-memory mock repository. */
export function renderApp(path: string, opts: { db?: MockDb; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const repo = new MockBookingRepository({ storage: null, initial: opts.db ?? createSeed(now), now: () => new Date() })
  const user = userEvent.setup()
  const utils = render(
    <AppProviders repository={repo}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )
  return { ...utils, user, repo }
}

/** Seed with no random appointments so tests control the agenda. */
export function emptyDb(now: Date): MockDb {
  return { ...createSeed(now), appointments: [], blocks: [] }
}
