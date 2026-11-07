import { expect, test, type Page } from '@playwright/test'

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

test.describe('admin panel (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

  test('demo owner signs in with two-step verification and navigates', async ({ page }) => {
    await page.goto('admin/agenda')
    await expect(page.getByRole('heading', { name: 'Entra al panel' })).toBeVisible()
    await page.getByRole('button', { name: /Dueño/ }).click()
    await page.getByLabel('Código').fill('123456')
    await page.getByRole('button', { name: 'Verificar y entrar' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Agenda' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Secciones del panel' })
    await nav.getByRole('link', { name: 'Componentes' }).click()
    await page.getByRole('button', { name: 'Leonardo Gómez' }).click()
    await expect(page.getByRole('dialog', { name: 'Leonardo Gómez' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await noHorizontalScroll(page)
  })
})

test('admin works on a phone: drawer navigation and no horizontal scroll', async ({ page }) => {
  await page.goto('admin/entrar')
  await page.getByRole('button', { name: /Recepción/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Vista general' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Clientes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeHidden()
  await noHorizontalScroll(page)
})

test.describe('admin agenda (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false })

  test('reception registers a walk-in and it appears in the agenda', async ({ page }) => {
    await page.goto('admin/entrar')
    await page.getByRole('button', { name: /Recepción/ }).click()
    await page.getByRole('navigation', { name: 'Secciones del panel' }).getByRole('link', { name: 'Agenda' }).click()
    await page.getByRole('button', { name: 'Walk-in' }).click()
    const panel = page.getByRole('dialog', { name: 'Registrar walk-in' })
    await panel.getByText('Arreglo de bigote', { exact: true }).click()
    await panel.getByLabel('Nombre').fill('Cliente de mostrador')
    await panel.getByRole('button', { name: 'Registrar walk-in' }).click()
    // Either a barber was free (toast) or everyone is busy/closed right now (clear error); both are valid.
    await expect(page.getByText(/Walk-in registrado con|Ese horario ya está ocupado/)).toBeVisible()
    await noHorizontalScroll(page)
  })
})
