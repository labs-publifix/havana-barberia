import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useCatalog, useStaff } from '@/app/queries'
import { useNow } from '@/app/useNow'
import { business } from '@/config/business'
import { localDate } from '@/lib/time'
import { NewAppointmentPanel, type NewAppointmentDraft } from './NewAppointmentPanel'

interface Ctx {
  /** Open the booking panel from anywhere (top bar, agenda grid, shortcut). */
  open(draft?: Partial<NewAppointmentDraft>): void
  isOpen: boolean
}

const NewAppointmentCtx = createContext<Ctx | null>(null)

/** One booking panel for the whole admin, so "Agendar cita" works on every screen. */
export function NewAppointmentProvider({ children }: { children: ReactNode }) {
  const now = useNow(30_000)
  const tz = business.hours.timeZone
  const { data: catalog } = useCatalog()
  const { data: staff } = useStaff()
  const [draft, setDraft] = useState<NewAppointmentDraft | null>(null)

  const open = useCallback(
    (d: Partial<NewAppointmentDraft> = {}) =>
      setDraft({ kind: 'cita', staffId: 'any', date: localDate(new Date(), tz), ...d }),
    [tz],
  )
  const value = useMemo(() => ({ open, isOpen: draft !== null }), [open, draft])

  return (
    <NewAppointmentCtx.Provider value={value}>
      {children}
      <NewAppointmentPanel
        draft={draft}
        staff={staff ?? []}
        categories={catalog?.categories ?? []}
        services={catalog?.services ?? []}
        timeZone={tz}
        now={now}
        onClose={() => setDraft(null)}
      />
    </NewAppointmentCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNewAppointment() {
  const v = useContext(NewAppointmentCtx)
  if (!v) throw new Error('NewAppointmentProvider is missing')
  return v
}
