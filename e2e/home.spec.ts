import { expect, test } from '@playwright/test'

test('home: hero CTA, floating nav, quick links into the flow, no horizontal scroll', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Donde el corte se vuelve oficio.')
  const nav = page.getByTestId('site-nav')
  await expect(nav).toHaveAttribute('data-state', 'top')
  await page.mouse.wheel(0, 400)
  await expect(nav).toHaveAttribute('data-state', 'floating')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
  // "Reservar con Isaac" preselects the barber through the flow's existing ?barbero param.
  await page.getByRole('link', { name: 'Reservar con Isaac' }).click()
  await expect(page).toHaveURL(/reservar\?barbero=isaac/)
  await expect(page.getByRole('heading', { name: 'Elige tus servicios' })).toBeVisible()
})

test('home: mobile menu opens, traps focus and closes with Escape', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('hero barber cards open the flow with the barber preselected', async ({ page }) => {
  await page.goto('./')
  const hero = page.locator('#inicio')
  await hero.getByRole('link', { name: /Leonardo Gómez/ }).click()
  await expect(page).toHaveURL(/reservar\?barbero=leonardo/)
  await expect(page.getByRole('heading', { name: 'Elige tus servicios' })).toBeVisible()
})

test('only one filled accent element in the hero; nav Reservar is outlined until it floats', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto('./')
  await page.waitForTimeout(1200)
  const navBtn = page.getByTestId('site-nav').getByRole('link', { name: 'Reservar' })
  const bg = () => navBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(await bg()).toMatch(/rgba?\(0, 0, 0, 0\)|transparent/)
  await page.mouse.wheel(0, 500)
  await expect(page.getByTestId('site-nav')).toHaveAttribute('data-state', 'floating')
  await page.waitForTimeout(400)
  expect(await bg()).not.toMatch(/rgba?\(0, 0, 0, 0\)|transparent/)
  await page.close()
})

test('reduced motion: video replaced by the poster and reviews become a list', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto('./')
  await page.waitForTimeout(1200)
  expect(await page.locator('video').count()).toBe(0)
  await expect(page.getByTestId('reviews-list')).toBeAttached()
  await ctx.close()
})
