import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Tabs for switching views inside a section (ARIA tabs pattern: arrow keys,
 * Home/End; one tab in the Tab order). Render the content with <TabPanel>.
 */
export function Tabs<T extends string>({
  label,
  value,
  onChange,
  tabs,
  idBase,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  tabs: { value: T; label: ReactNode }[]
  idBase: string
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = tabs.length
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next]!.value)
    document.getElementById(`${idBase}-tab-${tabs[next]!.value}`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]"
    >
      {tabs.map((t, i) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            id={`${idBase}-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`${idBase}-panel-${t.value}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              '-mb-px inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[15px] font-semibold transition-colors duration-fast',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
              on ? 'border-ink-950 text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ idBase, value, children }: { idBase: string; value: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} tabIndex={-1}>
      {children}
    </div>
  )
}
