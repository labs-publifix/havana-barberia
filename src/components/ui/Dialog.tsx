import * as RD from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Bottom sheet on phones, centered dialog from 480px. Built on Radix Dialog. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-overlay bg-ink-950/60 data-[state=open]:animate-[fade-in_200ms_ease-out]" />
        <RD.Content
          className={cn(
            'pb-safe fixed inset-x-0 bottom-0 z-modal max-h-[90dvh] overflow-y-auto rounded-t-xl bg-raised p-6 text-fg shadow-lg',
            'data-[state=open]:animate-[sheet-up_320ms_cubic-bezier(.2,.8,.2,1)]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(440px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-6',
            'sm:data-[state=open]:animate-[fade-in_200ms_ease-out]',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <RD.Title className="t-h3">{title}</RD.Title>
            <RD.Close
              className="-m-2 grid size-tap shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              aria-label="Cerrar"
            >
              <X className="size-5" strokeWidth={1.75} />
            </RD.Close>
          </div>
          {description ? (
            <RD.Description className="mt-2 text-fg-muted">{description}</RD.Description>
          ) : (
            <RD.Description className="sr-only">{title}</RD.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}
