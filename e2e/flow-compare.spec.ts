import { test, type Page } from '@playwright/test'

/**
 * Captures the booking flow with a fixed clock so "before" and "after" runs are
 * pixel-comparable. Run with FLOW_DIR=docs/screenshots/redesign/flow-before (or -after).
 */
test.skip(!process.env.FLOW_DIR, 'Set FLOW_DIR to capture the booking flow')

const dir = process.env.FLOW_DIR!
// Monday Nov 9, 2026, 09:00 in Querétaro (UTC-6): deterministic seed and slots.
const FIXED = new Date('2026-11-09T15:00:00.000Z')

const sizes = [
  [360, 740],
  [390, 844],
  [1280, 800],
] as const

async function prepare(page: Page) {
  await page.clock.setFixedTime(FIXED)
  await page.goto('./')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
}

const shot = (page: Page, w: number, h: number, name: string) =>
  page.screenshot({ path: `${dir}/${w}x${h}/${name}.png`, animations: 'disabled' })

for (const [w, h] of sizes) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 })

    test('booking flow', async ({ page }) => {
      await prepare(page)
      await page.goto('./reservar?servicios=corte-adulto')
      await page.getByText('Tus servicios').waitFor()
      await shot(page, w, h, '1-servicios')
      await page.goto('./reservar?paso=2&servicios=corte-adulto')
      await page.getByRole('radio', { name: /Isaac Fuentes/ }).waitFor()
      await page.waitForTimeout(300)
      await shot(page, w, h, '2-barbero')
      await page.goto('./reservar?paso=3&servicios=corte-adulto&barbero=isaac&fecha=2026-11-09')
      await page.locator('fieldset button:not([disabled])').first().click()
      await shot(page, w, h, '3-fecha-hora')
      await page.getByRole('button', { name: /Continuar/ }).click()
      await page.getByLabel('Nombre').fill('Ana López')
      await page.getByLabel('Teléfono celular').fill('442 123 4567')
      await page.getByLabel('Correo electrónico').fill('ana@correo.com')
      await page.getByRole('checkbox').check()
      await shot(page, w, h, '4-datos')
      await page.getByRole('button', { name: /Continuar/ }).click()
      await page.getByRole('heading', { name: 'Revisa y confirma' }).waitFor()
      await page.waitForTimeout(300)
      await shot(page, w, h, '5-resumen')
      await page.getByRole('button', { name: 'Confirmar cita' }).click()
      await page.getByRole('heading', { name: /Tu cita está agendada/ }).waitFor()
      await page.waitForTimeout(600)
      await shot(page, w, h, '6-confirmacion')
      await page.goto('./cita/demo-cita')
      await page.getByRole('heading', { name: 'Tu cita' }).waitFor()
      await page.waitForTimeout(400)
      await shot(page, w, h, '7-cita')
      await page.goto('./lealtad/demo-lealtad')
      await page.getByText('Cómo funciona').waitFor()
      await page.waitForTimeout(400)
      await shot(page, w, h, '8-lealtad')
    })
  })
}
