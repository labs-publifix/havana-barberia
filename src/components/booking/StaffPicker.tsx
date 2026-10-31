import type { Staff, StaffChoice } from '@/domain/types'
import { cn } from '@/lib/cn'
import { Avatar, AnyBarberIcon } from './Avatar'

/** Radio group of barbers, with "Primero disponible" first. */
export function StaffPicker({
  staff,
  value,
  onChange,
}: {
  staff: Staff[]
  value: StaffChoice | null
  onChange: (v: StaffChoice) => void
}) {
  const options: { id: StaffChoice; name: string; sub: string; photo?: string | null }[] = [
    { id: 'any', name: 'Primero disponible', sub: 'Más horarios para elegir' },
    ...staff.map((s) => ({ id: s.id, name: s.name, sub: 'Barbero', photo: s.photoUrl })),
  ]
  return (
    <div role="radiogroup" aria-label="Barbero" className="grid gap-3">
      {options.map((o) => {
        const checked = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return
              e.preventDefault()
              const i = options.findIndex((x) => x.id === o.id)
              const next =
                options[
                  (i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length
                ]!
              onChange(next.id)
              ;(e.currentTarget.parentElement?.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus()
            }}
            tabIndex={checked || (value === null && o.id === 'any') ? 0 : -1}
            data-id={o.id}
            className={cn(
              'flex min-h-[80px] w-full items-center gap-4 rounded-lg border bg-raised p-3 pr-4 text-left',
              'transition-[background-color,border-color] duration-base ease-brand',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              checked ? 'border-[1.5px] border-fg' : 'border-line hover:border-line-strong',
            )}
          >
            {o.id === 'any' ? <AnyBarberIcon /> : <Avatar name={o.name} src={o.photo} />}
            <span className="min-w-0 flex-1">
              <span className="t-h4 block">{o.name}</span>
              <span className="text-sm text-fg-muted">{o.sub}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border-[1.5px]',
                checked ? 'border-fg' : 'border-line-strong',
              )}
            >
              {checked && <span className="size-3 rounded-full bg-fg" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
