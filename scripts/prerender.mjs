// Prerenders the public pages of the built site (dist/), so they paint before
// any JavaScript runs: each page is opened in Chrome, and once the app reports
// it has its data (html[data-ready], see src/app/boot.ts) the content of #root
// is written into that page's HTML file. In the browser the app then mounts
// behind it and takes its place.
//
// - Time-dependent text ([data-live]: «Abierto ahora», «Abre a las…») is kept
//   in the layout but hidden; the app fills it in.
// - Videos are left out; scroll reveals are shown; the hero has no entrance
//   fade (html[data-prerendered]), so its text is the first paint.
// - A page whose data did not load (database down, timeout) is left as it
//   was, and so is everything if Chrome can't start: the deploy goes on.
//
// Usage: node scripts/prerender.mjs [dist]   (after scripts/pages-404.mjs)
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { chromium } from '@playwright/test'

const dist = process.argv[2] ?? 'dist'
/** Path → file. The booking flow is left out on purpose. */
const PAGES = {
  '/': 'index.html',
  '/servicios': 'servicios.html',
  '/barberos/leonardo-gomez-rios': 'barberos/leonardo-gomez-rios.html',
  '/politicas': 'politicas.html',
  '/privacidad': 'privacidad.html',
}
const ROOT = '<div id="root"></div>'
const HTML_TAG = '<html lang="es-MX">'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

// Pages-like static server: /x → x.html, unknown → 404.html. Serves the
// original files (read once, before any of them is rewritten).
const originals = Object.fromEntries(Object.values(PAGES).map((f) => [f, readFileSync(join(dist, f), 'utf8')]))
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = [path, `${path}.html`, join(path, 'index.html')]
    .map((p) => join(dist, p))
    .find((p) => existsSync(p) && statSync(p).isFile())
  const name = file?.slice(dist.length + 1)
  res.writeHead(file ? 200 : 404, { 'content-type': TYPES[extname(file ?? '.html')] ?? 'application/octet-stream' })
  res.end(name && originals[name] ? originals[name] : readFileSync(file ?? join(dist, '404.html')))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`

let browser
for (const opts of [{ channel: 'chrome' }, {}]) {
  try {
    browser = await chromium.launch(opts)
    break
  } catch {
    /* try the next one */
  }
}
if (!browser) {
  console.warn('prerender: no Chrome available, pages stay client-rendered')
  server.close()
  process.exit(0)
}

let done = 0
for (const [path, file] of Object.entries(PAGES)) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  // Videos are never part of the snapshot; no need to download them.
  await page.route('**/*.mp4', (r) => r.abort())
  try {
    await page.goto(origin + path, { waitUntil: 'load' })
    await page.waitForSelector('html[data-ready]', { timeout: 15_000 })
    const state = await page.getAttribute('html', 'data-ready')
    if (state !== 'ok') throw new Error(`data not ready (${state})`)
    // Let the entrance animations finish so nothing is captured mid-fade.
    await page.waitForTimeout(1200)
    const html = await page.evaluate(() => {
      const root = document.getElementById('root').cloneNode(true)
      root.querySelectorAll('video').forEach((v) => v.remove())
      root.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-visible'))
      root.querySelectorAll('[data-live]').forEach((el) => el.setAttribute('style', 'visibility:hidden'))
      return root.innerHTML
    })
    const source = originals[file]
    if (!source.includes(ROOT)) throw new Error(`${file} has no ${ROOT}`)
    if (!source.includes(HTML_TAG)) throw new Error(`${file} has no ${HTML_TAG}`)
    // On <html> too, so the static page shows the hero without its entrance
    // fade (the text paints at once: that is the LCP).
    const out = source
      .replace(HTML_TAG, () => HTML_TAG.replace('>', ' data-prerendered="">'))
      .replace(ROOT, () => `<div id="root" data-prerendered="">${html}</div>`)
    writeFileSync(join(dist, file), out)
    console.log(`prerender: ${path} → ${file} (${Math.round(html.length / 1024)} KB)`)
    done++
  } catch (e) {
    console.warn(`prerender: ${path} skipped, ${e instanceof Error ? e.message : e}`)
  } finally {
    await page.close()
  }
}
await browser.close()
server.close()
console.log(`prerender: ${done}/${Object.keys(PAGES).length} pages`)
