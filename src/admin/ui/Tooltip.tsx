import type { ReactElement, ReactNode } from 'react'
import * as RT from '@radix-ui/react-tooltip'
import { cn } from '@/lib/cn'

export const TooltipProvider = RT.Provider

/**
 * Hover/focus tooltip (Radix): opens on keyboard focus too, closes with Escape,
 * and is announced as the trigger's description. `children` must accept a ref.
 */
export function Tip({
  content,
  children,
  side = 'top',
  align = 'center',
  disabled,
  className,
}: {
  content: ReactNode
  children: ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  disabled?: boolean
  className?: string
}) {
  if (disabled) return children
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-[70] max-w-[320px] rounded-md bg-ink-950 px-2.5 py-1.5 text-[13px] font-medium leading-snug text-white shadow-lg',
            'data-[state=delayed-open]:animate-[fade-in_120ms_ease-out]',
            className,
          )}
        >
          {content}
          <RT.Arrow className="fill-ink-950" width={10} height={5} />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  )
}
