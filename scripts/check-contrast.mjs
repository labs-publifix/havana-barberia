// WCAG 2.2 contrast check for the active accent theme.
// Reads real values from docs/design/havana-tokens-v2.css and src/styles/accent.css
// (or the file passed as the first argument), checks every text/background pair the
// UI uses, prints a table and writes docs/design/contrast-<theme>.md.
// Exit code 1 if any required pair fails.
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const themeFile = process.argv[2] ?? 'src/styles/accent.css'
const vars = {}
for (const f of ['docs/design/havana-tokens-v2.css', themeFile]) {
  for (const [, name, value] of readFileSync(f, 'utf8').matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[name] = value.trim()
}
// Resolve hex values and var() references (e.g. --color-accent-text-light: var(--color-accent-700)).
const resolve = (v, depth = 0) => {
  if (!v || depth > 5) return undefined
  const ref = v.match(/^var\(--([\w-]+)\)$/)
  if (ref) return resolve(vars[ref[1]], depth + 1)
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : undefined
}
const c = (token) => {
  if (token === 'white') return '#FFFFFF'
  const v = resolve(vars[`color-${token}`] ?? vars[token])
  if (!v) throw new Error(`Unknown token ${token}`)
  return v
}

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// [label, foreground token, background token, kind]; kind: text (4.5), ui (3.0), avoid (must not be used for text)
const pairs = [
  ['Botón de acento sobre negro (texto)', 'ink-950', 'accent-500', 'text'],
  ['Botón de acento · hover (texto)', 'ink-950', 'accent-400', 'text'],
  ['Botón de acento · presionado (texto)', 'ink-950', 'accent-600', 'text'],
  ['Botón de acento sobre fondo negro (componente)', 'accent-500', 'ink-950', 'ui'],
  ['Botón de acento sobre sección ink-900 (componente)', 'accent-500', 'ink-900', 'ui'],
  ['Botón principal sobre blanco (texto)', 'white', 'ink-950', 'text'],
  ['Texto de acento sobre blanco', 'accent-text-light', 'white', 'text'],
  ['Texto de acento sobre gray-50 (superficie)', 'accent-text-light', 'gray-50', 'text'],
  ['Texto fuerte de acento sobre blanco', 'accent-800', 'white', 'text'],
  ['Texto de acento sobre negro', 'accent-400', 'ink-950', 'text'],
  ['Texto de acento sobre ink-900', 'accent-400', 'ink-900', 'text'],
  ['Tarjeta seleccionada: texto', 'ink-950', 'accent-100', 'text'],
  ['Tarjeta seleccionada: texto secundario', 'gray-500', 'accent-100', 'text'],
  ['Tarjeta seleccionada: borde vs fondo de página', 'accent-700', 'white', 'ui'],
  ['Insignia «Confirmada»', 'accent-800', 'accent-100', 'text'],
  ['Tarjeta seleccionada oscura: texto', 'white', 'accent-selected-dark', 'text'],
  ['Tarjeta seleccionada oscura: texto secundario', 'gray-300', 'accent-selected-dark', 'text'],
  ['Tarjeta seleccionada oscura: borde accent-500', 'accent-500', 'ink-900', 'ui'],
  ['Sello ganado: número', 'ink-950', 'accent-500', 'text'],
  ['Sello ganado vs tarjeta negra', 'accent-500', 'ink-950', 'ui'],
  ['Premio: estrella accent-400 sobre negro', 'accent-400', 'ink-950', 'ui'],
  ['Foco de teclado sobre claro', 'ink-950', 'white', 'ui'],
  ['Foco de teclado sobre negro', 'accent-400', 'ink-950', 'ui'],
  ['Foco de teclado sobre ink-900', 'accent-400', 'ink-900', 'ui'],
  ['Selección de texto (claro)', 'ink-950', 'accent-300', 'text'],
  ['Selección de texto (oscuro)', 'ink-950', 'accent-500', 'text'],
  ['Chip blanco en hover (texto)', 'ink-950', 'accent-300', 'text'],
  ['Advertencia: texto', 'warning-700', 'warning-100', 'text'],
  ['Advertencia: borde vs fondo', 'warning-500', 'warning-100', 'ui'],
  ['Advertencia: borde vs blanco', 'warning-500', 'white', 'ui'],
  ['Error: texto', 'red-700', 'red-100', 'text'],
  ['Éxito: texto', 'success-700', 'success-100', 'text'],
  ['Información: texto', 'info-700', 'info-100', 'text'],
  ['Texto secundario sobre blanco', 'gray-500', 'white', 'text'],
  ['Texto secundario sobre negro', 'gray-300', 'ink-950', 'text'],
  // Combinations to avoid (documented; must not appear as text in the UI).
  ['EVITAR: accent-500 como texto sobre blanco', 'accent-500', 'white', 'avoid'],
  ['EVITAR: blanco sobre botón accent-500', 'white', 'accent-500', 'avoid'],
  ['EVITAR: accent-400 sobre gris claro', 'accent-400', 'gray-100', 'avoid'],
  ['Separación advertencia vs dorado (accent-500)', 'warning-500', 'accent-500', 'avoid'],
]

const min = { text: 4.5, ui: 3, avoid: 0 }
let failed = 0
const rows = pairs.map(([label, fg, bg, kind]) => {
  const r = ratio(c(fg), c(bg))
  const ok = kind === 'avoid' ? true : r >= min[kind]
  if (!ok) failed++
  const level = kind === 'avoid' ? 'No usar' : r >= (kind === 'text' ? 7 : 4.5) ? 'AAA' : ok ? 'AA' : 'FALLA'
  return { label, fg: `${fg} ${c(fg)}`, bg: `${bg} ${c(bg)}`, kind, r: r.toFixed(1), level, ok }
})

const theme = basename(themeFile, '.css').replace(/^accent\.?/, '') || 'active'
const md = [
  `# Contraste WCAG · tema \`${basename(themeFile)}\``,
  '',
  'Generado por `npm run contrast`. Texto normal ≥ 4.5:1; componentes y texto grande ≥ 3:1.',
  '',
  '| Combinación | Primer plano | Fondo | Tipo | Relación | Nivel |',
  '|---|---|---|---|---|---|',
  ...rows.map(
    (x) =>
      `| ${x.label} | \`${x.fg}\` | \`${x.bg}\` | ${x.kind === 'text' ? 'texto' : x.kind === 'ui' ? 'componente' : 'evitar'} | ${x.r}:1 | ${x.level} |`,
  ),
  '',
  failed ? `**${failed} combinaciones no cumplen.**` : '**Todas las combinaciones requeridas cumplen WCAG AA.**',
  '',
].join('\n')
writeFileSync(`docs/design/contrast-${theme === 'active' ? 'accent' : theme}.md`, md)

for (const x of rows) console.log(`${x.ok ? '✓' : '✗'} ${x.r.padStart(5)}:1 ${x.level.padEnd(7)} ${x.label}`)
console.log(failed ? `\n${failed} required pair(s) fail` : '\nAll required pairs pass WCAG AA')
process.exit(failed ? 1 : 0)
