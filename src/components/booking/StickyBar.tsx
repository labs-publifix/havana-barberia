import type { ReactNode } from 'react'

/**
 * Fixed action bar for the booking flow: total + main button.
 * Respects the iPhone safe area. A spacer keeps content from hiding behind it.
 */
export function StickyBar({ summary, children }: { summary?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-36" />
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-raised/95 shadow-[0_-8px_24px_rgba(10,10,11,.08)] backdrop-blur supports-[backdrop-filter]:bg-raised/85">
        <div className="pb-safe mx-auto grid max-w-booking gap-3 px-4 pt-3">
          {summary}
          {children}
        </div>
      </div>
    </>
  )
}
