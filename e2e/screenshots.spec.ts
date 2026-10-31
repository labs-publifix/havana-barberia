import { expect, test } from '@playwright/test'

/**
 * Captures every screen at the four reference sizes into docs/screenshots.
 * Run with: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to refresh docs/screenshots')

const sizes = [
  [360, 740],
  [390, 844],
  [768, 1024],
  [1280, 800],
] as const

const screens: {
  name: string
  path: string
  full?: boolean
  prepare?: (p: import('@playwright/test').Page) => Promise<void>
}[] = [
  { name: '01-home', path: './', full: true },
  { name: '02-servicios', path: './reservar' },
  { name: '03-servicio-elegido', path: './reservar?servicios=corte-barba' },
  { name: '04-barbero', path: './reservar?paso=2&servicios=corte-barba&barbero=any' },
  {
    name: '05-fecha-hora',
    path: './reservar?paso=3&servicios=corte-barba&barbero=any',
    prepare: async (p) => {
      await p.locator('fieldset button:not([disabled])').nth(1).click()
    },
  },
  {
    name: '06-datos',
    path: './reservar?paso=3&servicios=corte-barba&barbero=any',
    prepare: async (p) => {
      await p.locator('fieldset button:not([disabled])').first().click()
      await p.getByRole('button', { name: /Continuar/ }).click()
      await p.getByLabel('Nombre').fill('Ana López')
      await p.getByLabel('Teléfono celular').fill('442 123 4567')
      await p.getByLabel('Correo electrónico').fill('ana@correo')
      await p.getByLabel('Correo electrónico').blur()
    },
  },
  { name: '07-cita', path: './cita/demo-cita' },
  { name: '08-lealtad', path: './lealtad/demo-lealtad' },
  { name: '09-politicas', path: './politicas' },
  { name: '10-404', path: './no-existe' },
]

for (const [w, h] of sizes) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 })
    for (const s of screens) {
      test(s.name, async ({ page }) => {
        await page.goto(s.path)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)
        if (s.prepare) await s.prepare(page)
        await page.waitForTimeout(400)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w)
        await page.screenshot({
          path: `docs/screenshots/${w}x${h}/${s.name}.jpg`,
          type: 'jpeg',
          quality: 80,
          fullPage: s.full ?? false,
        })
      })
    }
    test('11-confirmacion', async ({ page }) => {
      await page.goto('./reservar?paso=3&servicios=bigote&barbero=isaac')
      await page.locator('fieldset button:not([disabled])').first().click()
      await page.getByRole('button', { name: /Continuar/ }).click()
      await page.getByLabel('Nombre').fill(`Ana López ${w}`)
      await page.getByLabel('Teléfono celular').fill(`442 123 ${String(w).padStart(4, '0')}`)
      await page.getByLabel('Correo electrónico').fill(`ana${w}@correo.com`)
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: /Continuar/ }).click()
      await page.screenshot({ path: `docs/screenshots/${w}x${h}/10b-resumen.jpg`, type: 'jpeg', quality: 80 })
      await page.getByRole('button', { name: 'Confirmar cita' }).click()
      await expect(page.getByRole('heading', { name: /Tu cita está agendada/ })).toBeVisible()
      await page.waitForTimeout(500)
      await page.screenshot({
        path: `docs/screenshots/${w}x${h}/11-confirmacion.jpg`,
        type: 'jpeg',
        quality: 80,
        fullPage: true,
      })
    })
  })
}
