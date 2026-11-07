import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ToastItem {
  id: number
  tone: 'success' | 'danger'
  text: string
}

const Ctx = createContext<((text: string, tone?: ToastItem['tone']) => void) | null>(null)

/** Short confirmations ("Cambios guardados") announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)
  const push = useCallback((text: string, tone: ToastItem['tone'] = 'success') => {
    const id = next.current++
    setItems((xs) => [...xs.slice(-2), { id, tone, text }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-toast grid justify-items-center gap-2 sm:inset-x-auto sm:right-6 sm:justify-items-end"
      >
        {items.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : XCircle
          return (
            <p
              key={t.id}
              className="flex animate-[rise_200ms_ease-out] items-center gap-2.5 rounded-full bg-ink-950 py-2.5 pl-3.5 pr-5 text-sm font-medium text-white shadow-lg"
            >
              <Icon
                className={cn('size-5', t.tone === 'success' ? 'text-aqua-400' : 'text-red-500')}
                strokeWidth={1.75}
                aria-hidden
              />
              {t.text}
            </p>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const push = useContext(Ctx)
  if (!push) throw new Error('ToastProvider is missing')
  return push
}
