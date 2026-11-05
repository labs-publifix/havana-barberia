import * as RD from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Side panel for details and edit forms: keeps the list visible behind it.
 * Full screen on phones; 480px from the right on larger screens. Radix Dialog
 * handles focus trap, Escape and returning focus to the row that opened it.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** 600px instead of 480px (forms with grids, like booking times). */
  wide?: boolean
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-overlay bg-ink-950/40 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <RD.Content
          className={cn(
            'fixed inset-y-0 right-0 z-modal flex w-full flex-col bg-raised text-fg shadow-lg outline-none data-[state=open]:animate-[panel-in_260ms_cubic-bezier(.2,.8,.2,1)] sm:border-l sm:border-line',
            wide ? 'sm:w-[min(600px,100vw)]' : 'sm:w-[min(480px,100vw)]',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div className="min-w-0">
              <RD.Title className="text-lg font-semibold tracking-[-0.01em]">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-sm text-fg-muted">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close
              aria-label="Cerrar panel"
              className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus coarse:size-tap"
            >
              <X className="size-5" strokeWidth={1.75} />
            </RD.Close>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <footer className="pb-safe flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </footer>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
