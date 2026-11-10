import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import type { Staff } from '@/domain/types'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { Select } from '../ui/Select'
import { errorMessage } from './useAgendaActions'

/** iPhone/Mac open webcal:// links in Calendar; Google takes the same link as "cid". */
const webcal = (url: string) => url.replace(/^https?:\/\//, 'webcal://')
const googleAdd = (url: string) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal(url))}`

/**
 * "Conectar a mi calendario": a private link that the phone's calendar
 * subscribes to, so appointments appear there on their own. Barbers get their
 * own agenda; the desk can pick the whole shop or any barber.
 */
export function CalendarConnect({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  staff: Staff[]
}) {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const own = user.role === 'barber'
  const [scope, setScope] = useState<string>(own ? (user.staffId ?? '') : '')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const get = useMutation({
    mutationFn: (reset: boolean) => repo.getCalendarLink(scope || null, reset),
    onSuccess: (url) => {
      setLink(url)
      setError(null)
      setCopied(false)
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setLink(null)
          setError(null)
        }
      }}
      title="Conectar a mi calendario"
      description="Tus citas aparecen solas en el calendario de tu teléfono: nuevas, cambios y cancelaciones. El teléfono revisa cada 15 minutos a unas horas, según la app."
    >
      <div className="grid gap-4">
        {!own && (
          <Select
            label="Qué calendario"
            value={scope}
            onValueChange={(v) => {
              setScope(v)
              setLink(null)
            }}
            options={[
              { value: '', label: 'Toda la barbería' },
              ...staff.filter((s) => s.active).map((s) => ({ value: s.id, label: `Solo ${s.name}` })),
            ]}
          />
        )}

        {error && <Alert tone="danger" title={error} />}

        {!link ? (
          <button
            type="button"
            disabled={get.isPending}
            onClick={() => get.mutate(false)}
            className={buttonClass({ className: 'justify-self-start' })}
          >
            {get.isPending ? 'Preparando…' : 'Obtener mi enlace'}
          </button>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <a href={webcal(link)} className={buttonClass({ size: 'sm' })}>
                Agregar en iPhone
              </a>
              <a
                href={googleAdd(link)}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Agregar a Google Calendar
              </a>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="calendar-link" className="text-[13px] font-medium">
                Tu enlace privado
              </label>
              <div className="flex gap-2">
                <input
                  id="calendar-link"
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-md border-[1.5px] border-line-strong bg-raised px-3 text-sm"
                />
                <button type="button" onClick={copy} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <ul className="grid list-disc gap-1 pl-5 text-[13px] text-fg-muted">
              <li>
                <strong className="font-semibold text-fg">iPhone:</strong> abre esta pantalla en el iPhone y toca
                «Agregar en iPhone» › Suscribirse.
              </li>
              <li>
                <strong className="font-semibold text-fg">Android o Google:</strong> en una computadora, toca «Agregar a
                Google Calendar» (con tu cuenta de Google) y aparece en el teléfono.
              </li>
              <li>
                Es privado: quien lo tenga ve tus citas. Si lo compartiste por error,{' '}
                <button
                  type="button"
                  disabled={get.isPending}
                  onClick={() => get.mutate(true)}
                  className="font-medium text-fg underline underline-offset-4"
                >
                  genera uno nuevo
                </button>{' '}
                y el anterior deja de funcionar.
              </li>
            </ul>
          </>
        )}
      </div>
    </Dialog>
  )
}
