import { useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { capitalize, formatDay, money } from '@/lib/time'
import { Tip } from '../ui/Tooltip'
import { niceTicks, type DayPoint } from './metrics'

/**
 * Report charts, following the data-viz method: thin marks with 4px rounded
 * ends, hairline grid, one hue for magnitude (emphasis: this period in ink,
 * the previous one in gray), validated categorical slots (viz-1..3) only for
 * parts of a whole, text in text colors, and every value also reachable
 * without hovering (labels or a table).
 */

const compact = (n: number) => (n >= 10000 ? `$${Math.round(n / 1000)}K` : money(n))

/** Change against the previous period: arrow + signed percent; green when it is good news. */
export function Delta({
  pct,
  upIsGood = true,
  vs,
  unit = '%',
}: {
  pct: number | null
  upIsGood?: boolean
  vs: string
  /** "%" for a relative change; "pts" for the difference between two percentages. */
  unit?: '%' | 'pts'
}) {
  if (pct === null) return <span className="text-[13px] text-fg-muted">Sin datos de {vs}</span>
  const good = pct === 0 ? null : pct > 0 === upIsGood
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[13px]">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 font-semibold',
          good === null ? 'text-fg-muted' : good ? 'text-success-700' : 'text-red-700',
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
        {pct > 0 ? '+' : ''}
        {pct} {unit}
      </span>
      <span className="text-fg-muted">vs. {vs}</span>
    </span>
  )
}

/** Tiny trend line for a stat tile: gray, with the last point in ink. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null
  const w = 96
  const h = 28
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 6)] as const)
  const last = pts.at(-1)!
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={label}
      className="shrink-0 overflow-visible"
    >
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-gray-300"
      />
      <circle cx={last[0]} cy={last[1]} r={4} className="fill-ink-950 stroke-raised" strokeWidth={2} />
    </svg>
  )
}

/** KPI tile: label, value (proportional figures), change vs. the previous period, optional trend. */
export function StatTile({
  label,
  value,
  delta,
  spark,
  hint,
  className,
}: {
  className?: string
  label: string
  value: string
  delta: ReactNode
  spark?: number[]
  hint?: string
}) {
  return (
    <div className={cn('grid content-between gap-3 rounded-lg border border-line bg-raised p-5', className)}>
      <p className="text-[13px] font-medium text-fg-muted">{label}</p>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <p className="text-[30px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
        {spark && <Sparkline values={spark} label={`Tendencia de ${label.toLowerCase()} por día`} />}
      </div>
      <div className="grid gap-0.5">
        {delta}
        {hint && <p className="text-[12px] text-fg-muted">{hint}</p>}
      </div>
    </div>
  )
}

/** Legend item: a swatch shaped like the mark, then the name in text color. */
export function Key({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted">
      <span className={cn('size-2.5 rounded-[3px]', swatch)} aria-hidden />
      {children}
    </span>
  )
}

/**
 * Sales per day: this period's column (ink) next to the same day of the
 * previous period (gray). Hover or focus a day for its figures.
 */
export function DailyColumns({ days, previous, vs }: { days: DayPoint[]; previous: DayPoint[]; vs: string }) {
  const ticks = niceTicks(Math.max(1, ...days.map((d) => d.sales), ...previous.map((d) => d.sales)))
  const top = ticks.at(-1)!
  const many = days.length > 14
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-4">
        <Key swatch="bg-ink-950">Este periodo</Key>
        <Key swatch="bg-gray-300">{capitalize(vs)}</Key>
      </div>
      <div className="relative mt-2 h-56 pl-12">
        {ticks.map((t) => (
          <div
            key={t}
            className="pointer-events-none absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: `calc(${(t / top) * 100}% * (224 - 24) / 224 + 24px)` }}
            aria-hidden
          >
            <span className="tabular w-10 text-right text-[11px] text-fg-muted">{compact(t)}</span>
            <span className={cn('h-px flex-1', t === 0 ? 'bg-gray-300' : 'bg-gray-100')} />
          </div>
        ))}
        <div className="absolute inset-y-0 left-12 right-0 flex items-stretch gap-0.5">
          {days.map((d, i) => {
            const p = previous[i]
            const label = capitalize(formatDay(d.date, many ? 'd' : 'EEE d'))
            return (
              <Tip
                key={d.date}
                content={
                  <span className="grid gap-0.5">
                    <span className="font-semibold">{capitalize(formatDay(d.date, "EEEE d 'de' MMMM"))}</span>
                    <span>
                      {money(d.sales)} · {d.done} {d.done === 1 ? 'cita' : 'citas'}
                    </span>
                    {p && (
                      <span className="text-white/70">
                        {capitalize(vs)}: {money(p.sales)}
                      </span>
                    )}
                  </span>
                }
              >
                <button
                  type="button"
                  aria-label={`${capitalize(formatDay(d.date, "EEEE d 'de' MMMM"))}: ${money(d.sales)}, ${d.done} citas${p ? `; ${vs}: ${money(p.sales)}` : ''}`}
                  className="group relative flex min-w-0 flex-1 flex-col justify-end rounded-sm pb-6 hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="flex h-full items-end justify-center gap-[2px]">
                    {p && (
                      <span
                        className="w-full max-w-[10px] rounded-t-[4px] bg-gray-300"
                        style={{ height: `${(p.sales / top) * 100}%`, minHeight: p.sales ? 2 : 0 }}
                      />
                    )}
                    <span
                      className="w-full max-w-[16px] rounded-t-[4px] bg-ink-950 group-hover:bg-ink-700"
                      style={{ height: `${(d.sales / top) * 100}%`, minHeight: d.sales ? 2 : 0 }}
                    />
                  </span>
                  <span
                    className={cn(
                      'tabular absolute inset-x-0 bottom-0 truncate text-center text-[11px] text-fg-muted',
                      many && i % 2 === 1 && 'invisible sm:visible',
                    )}
                    aria-hidden
                  >
                    {label}
                  </span>
                </button>
              </Tip>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Ranked horizontal bars (one hue), value at the tip; `extra` adds context under the name. */
export function RankedBars({
  rows,
  format = money,
  label,
}: {
  rows: { id: string; name: string; value: number; extra?: ReactNode }[]
  format?: (n: number) => string
  label: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ol className="grid gap-4" aria-label={label}>
      {rows.map((r) => (
        <li key={r.id} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.name}</span>
            <span className="tabular shrink-0 font-semibold">{format(r.value)}</span>
          </div>
          <div className="h-3 rounded-r-[4px] bg-fg/[0.04]">
            <div
              className="h-full rounded-r-[4px] bg-ink-950"
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 2 : 0 }}
            />
          </div>
          {r.extra && <div className="text-[13px] text-fg-muted">{r.extra}</div>}
        </li>
      ))}
    </ol>
  )
}

const SLOTS = ['bg-viz-1', 'bg-viz-2', 'bg-viz-3']

/**
 * One whole split into parts (≤ 3 here): a tall segmented bar with the share
 * printed where it fits, and a list with each part's figures.
 */
export function SplitBar({
  parts,
  label,
  format = money,
}: {
  parts: { key: string; name: string; value: number; detail?: string }[]
  label: string
  format?: (n: number) => string
}) {
  const total = parts.reduce((t, p) => t + p.value, 0)
  const share = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  return (
    <div className="grid gap-4">
      <div
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.name} ${share(p.value)} %`).join(', ')}`}
        className="flex h-7 gap-[2px] overflow-hidden rounded-[4px]"
      >
        {total === 0 ? (
          <div className="flex-1 rounded-[4px] bg-gray-100" />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p) => {
              const i = parts.indexOf(p)
              const pct = share(p.value)
              return (
                <div
                  key={p.key}
                  className={cn('flex items-center rounded-[4px] px-2 text-[12px] font-semibold text-white', SLOTS[i])}
                  style={{ flexGrow: p.value, flexBasis: 0 }}
                >
                  {pct >= 12 ? `${pct} %` : ''}
                </div>
              )
            })
        )}
      </div>
      <ul className="grid gap-2 text-sm">
        {parts.map((p, i) => (
          <li key={p.key} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <span className={cn('size-2.5 rounded-[3px]', SLOTS[i])} aria-hidden />
              {p.name}
              {p.detail && <span className="text-[13px] text-fg-muted">{p.detail}</span>}
            </span>
            <span className="tabular">
              <span className="font-semibold">{format(p.value)}</span>
              <span className="ml-2 inline-block w-11 text-right text-fg-muted">{share(p.value)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const HEAT = ['bg-gray-50', 'bg-aqua-100', 'bg-aqua-300', 'bg-aqua-500', 'bg-aqua-700', 'bg-aqua-800']
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** Busiest days and hours: one sequential hue, darker = more appointments. */
export function DemandHeatmap({ grid, hours }: { grid: number[][]; hours: number[] }) {
  const max = Math.max(1, ...grid.flat())
  const [focus, setFocus] = useState<string | null>(null)
  const step = (n: number) =>
    n === 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor(((n - 1) / max) * (HEAT.length - 1)))
  return (
    <div className="grid gap-3">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] table-fixed border-separate border-spacing-[2px] text-[11px]">
          <caption className="sr-only">Citas por día de la semana y hora de inicio</caption>
          <thead>
            <tr>
              <th scope="col" className="w-11">
                <span className="sr-only">Día</span>
              </th>
              {hours.map((h) => (
                <th key={h} scope="col" className="tabular pb-1 font-normal text-fg-muted">
                  {h > 12 ? h - 12 : h}
                  {h >= 12 ? 'p' : 'a'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={DAYS[r]}>
                <th scope="row" className="pr-2 text-left font-medium text-fg-muted">
                  {DAYS[r]}
                </th>
                {row.map((n, c) => {
                  const id = `${r}-${c}`
                  return (
                    <td key={id} className="p-0">
                      <Tip content={`${DAYS[r]} ${hours[c]}:00 · ${n} ${n === 1 ? 'cita' : 'citas'}`}>
                        <button
                          type="button"
                          aria-label={`${DAYS[r]} a las ${hours[c]}:00: ${n} citas`}
                          onFocus={() => setFocus(id)}
                          onBlur={() => setFocus(null)}
                          className={cn(
                            'block h-7 w-full rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
                            HEAT[step(n)],
                            focus === id && 'ring-2 ring-ink-950',
                          )}
                        />
                      </Tip>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-fg-muted" aria-hidden>
        Menos
        {HEAT.map((c) => (
          <span key={c} className={cn('size-3 rounded-[3px]', c)} />
        ))}
        Más
      </div>
    </div>
  )
}
