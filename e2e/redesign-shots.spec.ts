import { test, type Page } from '@playwright/test'

/**
 * Redesign screenshots: top, floating nav after scroll and every home section,
 * plus /servicios, at five sizes. Run with REDESIGN_SHOTS=1.
 */
test.skip(!process.env.REDESIGN_SHOTS, 'Set REDESIGN_SHOTS=1')

const dir = 'docs/screenshots/redesign'
const sizes = [
  [360, 740],
  [390, 844],
  [768, 1024],
  [1280, 800],
  [1440, 900],
] as const
const sections = ['resenas', 'tratamientos', 'barberos', 'galeria', 'ubicacion'] as const

const shot = (page: Page, w: number, h: number, name: string) =>
  page.screenshot({ path: `${dir}/${w}x${h}/${name}.jpg`, type: 'jpeg', quality: 82 })

for (const [w, h] of sizes) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 })

    test('home', async ({ page }) => {
      await page.goto('./')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1600)
      await shot(page, w, h, '01-hero')
      await page.mouse.wheel(0, Math.round(h * 0.55))
      await page.waitForTimeout(900)
      await shot(page, w, h, '02-nav-flotante')
      let i = 3
      for (const id of sections) {
        await page.evaluate((id) => document.getElementById(id)!.scrollIntoView(), id)
        await page.waitForTimeout(1100)
        await shot(page, w, h, `${String(i++).padStart(2, '0')}-${id}`)
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(1000)
      await shot(page, w, h, '08-cta-footer')
    })

    test('servicios', async ({ page }) => {
      await page.goto('./servicios')
      await page.getByRole('heading', { level: 2, name: 'Cortes' }).waitFor()
      await page.waitForTimeout(500)
      await shot(page, w, h, '09-servicios')
    })
  })
}
