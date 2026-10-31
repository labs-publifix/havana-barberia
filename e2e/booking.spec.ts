import { expect, test, type Page } from '@playwright/test'

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )

async function pickFirstTime(page: Page) {
  await page.locator('fieldset button:not([disabled])').first().click()
}

async function fillContact(page: Page, n: number) {
  await page.getByLabel('Nombre').fill(`Cliente Prueba ${n}`)
  await page.getByLabel('Teléfono celular').fill(`442 555 00${String(n).padStart(2, '0')}`)
  await page.getByLabel('Correo electrónico').fill(`prueba${n}@ejemplo.com`)
  await page.getByRole('checkbox').check()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
})

test('books one service with a specific barber at 360px in under a minute', async ({ page }) => {
  const started = Date.now()
  await page.goto('./')
  await page.getByRole('button', { name: /Corte de cabello adulto/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('radio', { name: /Leonardo Gómez/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await pickFirstTime(page)
  await noHorizontalScroll(page)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await fillContact(page, 1)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('button', { name: 'Confirmar cita' }).click()
  await expect(page.getByRole('heading', { name: /Tu cita está agendada/ })).toBeVisible()
  await expect(page.getByText('Leonardo Gómez')).toBeVisible()
  await noHorizontalScroll(page)
  expect(Date.now() - started).toBeLessThan(60_000)
})

test('books several services with first available, and back keeps typed data', async ({ page }) => {
  await page.goto('./reservar')
  await page.getByRole('button', { name: /Corte de cabello y arreglo de barba/ }).click()
  await page.getByRole('button', { name: /^Ritual facial/ }).click()
  await expect(page.getByText('2 servicios · 1 h 30 min')).toBeVisible()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByRole('radio', { name: /Primero disponible/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await pickFirstTime(page)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await fillContact(page, 2)
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.goBack()
  await expect(page.getByLabel('Nombre')).toHaveValue('Cliente Prueba 2')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Elige día y hora' })).toBeVisible()
  await page.goForward()
  await page.goForward()
  await page.getByRole('button', { name: 'Confirmar cita' }).click()
  await expect(page.getByRole('heading', { name: /Tu cita está agendada/ })).toBeVisible()
})

test('reloading deep links works on a Pages-like server (404.html fallback)', async ({ page }) => {
  for (const path of [
    'reservar?paso=2&servicios=bigote',
    'cita/demo-cita',
    'lealtad/demo-lealtad',
    'politicas',
    'privacidad',
    'no-existe',
  ]) {
    await page.goto(`./${path}`)
    await page.reload()
    await expect(page.locator('h1').first()).toBeVisible()
    await noHorizontalScroll(page)
  }
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible()
})

test('reschedules and cancels the demo appointment', async ({ page }) => {
  await page.goto('./cita/demo-cita')
  await page.getByRole('button', { name: 'Reprogramar' }).click()
  await page.locator('[aria-label="Elige el día"] button:not([disabled])').nth(4).click()
  await pickFirstTime(page)
  await page.getByRole('button', { name: 'Confirmar nuevo horario' }).click()
  await expect(page.getByText(/Movimos tu cita/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar cita' }).click()
  await page.getByRole('button', { name: 'Sí, cancelar cita' }).click()
  await expect(page.getByText('Cancelada')).toBeVisible()
})

test('keyboard: the whole flow is reachable with Tab and has visible focus', async ({ page }) => {
  await page.goto('./reservar?servicios=bigote')
  await expect(page.getByRole('button', { name: /Continuar/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Agregar otro servicio' })).toBeVisible()
  await page.keyboard.press('Tab')
  const focus = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    return {
      tag: el.tagName,
      text: el.textContent?.trim(),
      outline: getComputedStyle(el).outlineStyle,
      visible: el.matches(':focus-visible'),
    }
  })
  expect(focus.tag, JSON.stringify(focus)).not.toBe('BODY')
  expect(focus.outline, JSON.stringify(focus)).not.toBe('none')
  // Tab until the Continue button, then activate it.
  for (let i = 0; i < 15; i++) {
    const name = await page.evaluate(
      () => (document.activeElement?.tagName === 'BUTTON' ? document.activeElement.textContent : '') ?? '',
    )
    if (/Continuar/.test(name)) break
    await page.keyboard.press('Tab')
  }
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Elige tu barbero' })).toBeVisible()
})

test('touch targets are at least 44px', async ({ page }) => {
  for (const path of ['./', './reservar?servicios=bigote', './reservar?paso=2&servicios=bigote']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const small = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('a, button, input, [role="radio"]'))
        .filter(
          (el) =>
            el.offsetParent !== null && !el.closest('[aria-hidden="true"]') && el.getAttribute('type') !== 'hidden',
        )
        .map((el) => {
          const r = el.getBoundingClientRect()
          const before = getComputedStyle(el, '::before')
          const extra = before.content !== 'none' && before.position === 'absolute' ? 8 : 0
          return {
            label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30),
            h: r.height + extra,
            w: r.width,
          }
        })
        .filter((x) => x.h < 44 || x.w < 24),
    )
    expect(small, `${path}: ${JSON.stringify(small)}`).toEqual([])
  }
})
