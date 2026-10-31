import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { repo } from './store'
import type { DataSnapshot } from './types'

interface Ctx {
  data: DataSnapshot | null
  refresh: () => Promise<void>
}

const DataCtx = createContext<Ctx>({ data: null, refresh: async () => {} })

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSnapshot | null>(null)
  const refresh = useCallback(async () => setData(await repo.load()), [])

  useEffect(() => {
    refresh()
    // Otra pestaña (p. ej. el panel abierto mientras un cliente reserva) cambió los datos.
    const onStorage = () => refresh()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  return <DataCtx.Provider value={{ data, refresh }}>{children}</DataCtx.Provider>
}

export function useData() {
  return useContext(DataCtx)
}
