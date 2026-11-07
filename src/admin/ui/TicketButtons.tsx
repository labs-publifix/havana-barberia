import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { cn } from '@/lib/cn'
import { downloadTicket, printTicket, type TicketData } from '../ticket'
import { useToast } from './Toast'

/** "Imprimir ticket" and "Descargar PDF" for a paid appointment or sale. */
export function TicketButtons({ ticket, className }: { ticket: () => TicketData; className?: string }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async (fn: (t: TicketData) => Promise<void>) => {
    setBusy(true)
    try {
      await fn(ticket())
    } catch {
      toast('No se pudo generar el ticket. Intenta de nuevo.', 'danger')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={cn('mt-2 flex flex-wrap gap-2', className)}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(printTicket)}
        className={buttonClass({ variant: 'secondary', size: 'sm' })}
      >
        <Printer className="size-4" aria-hidden /> Imprimir ticket
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(downloadTicket)}
        className={buttonClass({ variant: 'ghost', size: 'sm' })}
      >
        <Download className="size-4" aria-hidden /> Descargar PDF
      </button>
    </div>
  )
}
