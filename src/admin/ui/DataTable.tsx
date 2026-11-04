import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface Column<T> {
  id: string
  header: string
  cell: (row: T) => ReactNode
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right'
  /** The cell that opens the row: rendered as a button for keyboard users. */
  primary?: boolean
  /** Hide on narrower screens to keep the table readable. */
  hideBelow?: 'md' | 'lg' | 'xl'
  className?: string
}

type Dir = 'asc' | 'desc'

const hide = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }

/**
 * Work table: sticky header, sortable columns (aria-sort), loading rows and
 * empty state. Rows open on click; the primary cell is a real button so the
 * same action works with Tab + Enter.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  onRowOpen,
  selectedKey,
  empty,
  initialSort,
  loadingRows = 6,
}: {
  caption: string
  columns: Column<T>[]
  /** undefined while loading. */
  rows: T[] | undefined
  rowKey: (row: T) => string
  onRowOpen?: (row: T) => void
  selectedKey?: string | null
  empty?: ReactNode
  initialSort?: { id: string; dir: Dir }
  loadingRows?: number
}) {
  const [sort, setSort] = useState(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows
    const col = columns.find((c) => c.id === sort.id)
    if (!col?.sortValue) return rows
    const get = col.sortValue
    const out = [...rows].sort((a, b) => {
      const x = get(a)
      const y = get(b)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')
      return sort.dir === 'asc' ? r : -r
    })
    return out
  }, [rows, sort, columns])

  const toggle = (id: string) =>
    setSort((s) => (s?.id === id ? { id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' }))

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-raised">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-[1] bg-surface">
          <tr className="border-b border-line">
            {columns.map((c) => {
              const active = sort?.id === c.id
              const ariaSort = active
                ? sort.dir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : c.sortValue
                  ? 'none'
                  : undefined
              const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
              return (
                <th
                  key={c.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cn(
                    'h-10 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted',
                    c.align === 'right' && 'text-right',
                    c.hideBelow && hide[c.hideBelow],
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={cn(
                        '-mx-1.5 inline-flex h-8 items-center gap-1 rounded px-1.5 uppercase hover:text-fg',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                        active && 'text-fg',
                        c.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {c.header}
                      <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {!sorted &&
            Array.from({ length: loadingRows }, (_, i) => (
              <tr key={i} className="border-b border-line last:border-0" aria-hidden>
                {columns.map((c) => (
                  <td key={c.id} className={cn('h-12 px-4', c.hideBelow && hide[c.hideBelow])}>
                    <span className="block h-3.5 w-3/4 animate-pulse rounded bg-fg/[0.07]" />
                  </td>
                ))}
              </tr>
            ))}
          {sorted?.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-fg-muted">
                {empty ?? 'No hay resultados.'}
              </td>
            </tr>
          )}
          {sorted?.map((row) => {
            const key = rowKey(row)
            const selected = key === selectedKey
            return (
              <tr
                key={key}
                onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                data-selected={selected || undefined}
                className={cn(
                  'border-b border-line transition-colors duration-fast last:border-0',
                  onRowOpen && 'cursor-pointer hover:bg-fg/[0.03]',
                  selected && 'bg-selected hover:bg-selected',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      'h-12 px-4 align-middle',
                      c.align === 'right' && 'tabular text-right',
                      c.hideBelow && hide[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.primary && onRowOpen ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRowOpen(row)
                        }}
                        className="-mx-1 rounded px-1 text-left font-medium text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        {c.cell(row)}
                      </button>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
