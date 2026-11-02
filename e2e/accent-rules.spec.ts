import { expect, test, type Page } from '@playwright/test'

/**
 * Guards the accent usage rules on real rendered pages:
 * - no white text on accent-500/400/600 surfaces,
 * - no accent-500 (bright) text on light surfaces,
 * - no leftover colors from the previous accent palette.
 */
const PREVIOUS_ACCENT = [
  '20, 221, 182',
  '75, 232, 200',
  '7, 107, 90',
  '216, 251, 242',
  '10, 138, 115',
  '13, 181, 150',
  '141, 242, 219',
  '13, 43, 38',
]

async function scan(page: Page) {
  return page.evaluate((previous) => {
    const css = getComputedStyle(document.documentElement)
    const hexToRgb = (hex: string) => {
      const h = hex.trim().replace('#', '')
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')
    }
    const accent = Object.fromEntries(
      ['400', '500', '600'].map((s) => [s, hexToRgb(css.getPropertyValue(`--color-accent-${s}`))]),
    )
    // Computed colors come as rgb()/rgba() or, through color-mix(), as color(srgb r g b / a) with 0–1 channels.
    const rgb = (v: string) => {
      const srgb = v.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/)
      if (srgb)
        return srgb
          .slice(1, 4)
          .map((n) => Math.round(Number(n) * 255))
          .join(', ')
      return (
        v
          .match(/\d+(\.\d+)?/g)
          ?.slice(0, 3)
          .map((n) => Math.round(Number(n)))
          .join(', ') ?? ''
      )
    }
    /** Every color found in a property value (shadows and gradients can hold several), normalized to "r, g, b". */
    const colorsIn = (v: string) => (v.match(/(rgba?|color)\([^)]*\)/g) ?? []).map(rgb)
    const alpha = (v: string) => {
      if (v === 'transparent') return 0
      const srgb = v.match(/color\(srgb [\d.]+ [\d.]+ [\d.]+(?: \/ ([\d.]+))?\)/)
      if (srgb) return srgb[1] ? Number(srgb[1]) : 1
      const parts = v
        .match(/rgba?\(([^)]+)\)/)?.[1]
        ?.split(/[ ,/]+/)
        .filter(Boolean)
      return parts && parts.length > 3 ? Number(parts[3]) : 1
    }
    const bgOf = (el: Element | null): string => {
      for (let e = el; e; e = e.parentElement) {
        const b = getComputedStyle(e).backgroundColor
        if (alpha(b) > 0.5) return rgb(b)
      }
      return '255, 255, 255'
    }
    const lum = (s: string) => {
      const [r, g, b] = s
        .split(', ')
        .map(Number)
        .map((x) => x / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const problems: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const st = getComputedStyle(el)
      for (const prop of [
        'color',
        'backgroundColor',
        'borderTopColor',
        'boxShadow',
        'outlineColor',
        'backgroundImage',
      ] as const) {
        const v = st[prop]
        if (colorsIn(v).some((c) => previous.includes(c)))
          problems.push(`previous accent in ${prop}: <${el.tagName.toLowerCase()} class="${el.className}">`)
      }
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())
      if (!ownText || el.offsetParent === null) continue
      const fg = rgb(st.color)
      const bg = bgOf(el)
      const label = el.textContent!.trim().slice(0, 30)
      if (fg === '255, 255, 255' && Object.values(accent).includes(bg))
        problems.push(`white text on accent: "${label}"`)
      if (fg === accent['500'] && lum(bg) > 0.5) problems.push(`accent-500 text on light: "${label}"`)
    }
    return problems
  }, PREVIOUS_ACCENT)
}

const pages = [
  './',
  './reservar',
  './reservar?servicios=corte-barba',
  './reservar?paso=2&servicios=corte-barba&barbero=any',
  './reservar?paso=3&servicios=corte-barba&barbero=any',
  './cita/demo-cita',
  './lealtad/demo-lealtad',
  './politicas',
  './no-existe',
  './__ui',
]

for (const path of pages) {
  test(`accent rules: ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(400)
    if (path.includes('paso=3')) await page.locator('fieldset button:not([disabled])').first().click()
    expect(await scan(page)).toEqual([])
  })
}
