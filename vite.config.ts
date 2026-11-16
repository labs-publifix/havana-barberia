/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { SEO_PAGES, seoHead, sitemapXml } from './src/config/seo'
import { businessJsonLd, jsonLdScript } from './src/config/businessJsonLd'
import { LOGO_SIZES } from './src/components/logoSizes'

const SEO_MARK = /<!--seo-->[\s\S]*?<!--\/seo-->/
const seoBlock = (path: string, extra = '') => `<!--seo-->\n    ${seoHead(path, extra)}\n    <!--/seo-->`

/**
 * Search metadata. Every public page gets its own static HTML with its title,
 * description, canonical and Open Graph tags (servicios.html and so on: Pages
 * serves /servicios from it with a 200, not through 404.html), plus
 * sitemap.xml. Only the build at the site root is indexed; other bases (the
 * demo) are noindex.
 */
function seoPages(): Plugin {
  let base = '/'
  let outDir = 'dist'
  return {
    name: 'havana:seo-pages',
    configResolved(config) {
      base = config.base
      outDir = config.build.outDir
    },
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        // A function, so «$$» in the JSON-LD is not read as a replacement pattern.
        html.replace('<!--seo-->', () =>
          seoBlock('/', base === '/' ? jsonLdScript(businessJsonLd()) : '<meta name="robots" content="noindex" />'),
        ),
    },
    writeBundle() {
      if (base !== '/') return
      const index = readFileSync(join(outDir, 'index.html'), 'utf8')
      if (!SEO_MARK.test(index)) throw new Error('index.html has no <!--seo--> block')
      for (const path of Object.keys(SEO_PAGES)) {
        if (path === '/') continue
        const file = join(outDir, `${path.slice(1)}.html`)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, index.replace(SEO_MARK, () => seoBlock(path)))
      }
      writeFileSync(join(outDir, 'sitemap.xml'), sitemapXml(new Date().toISOString().slice(0, 10)))
    },
  }
}

/**
 * Injects <link rel="preload"> for the hero image and the heading font so the
 * LCP starts downloading in parallel with the JS bundle.
 */
function preloadHero(): Plugin {
  let base = '/'
  return {
    name: 'havana:preload-hero',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const files = Object.values(ctx.bundle ?? {})
          .filter((c) => c.type === 'asset')
          .map((c) => c.fileName)
        // Home hero poster (LCP): 640w and 1280w versions, chosen by the browser.
        const poster = files.find((f) => /(^|\/)hero-poster-[\w-]+\.webp$/.test(f) && !/-(640|blur)-/.test(f))
        const poster640 = files.find((f) => /(^|\/)hero-poster-640-[\w-]+\.webp$/.test(f))
        // The navbar logo is the LCP element on phones: fetch it with the HTML,
        // not after the app renders (same srcset and sizes as <Logo>).
        const logo320 = files.find((f) => /(^|\/)logo-white-320-[\w-]+\.webp$/.test(f))
        const logo640 = files.find((f) => /(^|\/)logo-white-640-[\w-]+\.webp$/.test(f))
        // The display heading uses Geist 700: fetch it early so the LCP text does not wait.
        const font = files.find((f) => /geist-sans-latin-700-normal-[\w-]+\.woff2$/.test(f))
        const tags = [
          ...(poster && poster640
            ? [
                {
                  tag: 'link',
                  attrs: {
                    rel: 'preload',
                    as: 'image',
                    href: `${base}${poster}`,
                    imagesrcset: `${base}${poster640} 640w, ${base}${poster} 1280w`,
                    imagesizes: '100vw',
                    fetchpriority: 'high',
                  },
                  injectTo: 'head' as const,
                },
              ]
            : []),
          ...(logo320 && logo640
            ? [
                {
                  tag: 'link',
                  attrs: {
                    rel: 'preload',
                    as: 'image',
                    href: `${base}${logo320}`,
                    imagesrcset: `${base}${logo320} 320w, ${base}${logo640} 640w`,
                    imagesizes: LOGO_SIZES,
                    fetchpriority: 'high',
                  },
                  injectTo: 'head' as const,
                },
              ]
            : []),
          ...(font
            ? [
                {
                  tag: 'link',
                  attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${font}`, crossorigin: '' },
                  injectTo: 'head' as const,
                },
              ]
            : []),
        ]
        return { html, tags }
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || '/havana-barberia/'
  return {
    base,
    plugins: [react(), preloadHero(), seoPages()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
      rollupOptions: {
        // The demo data has no side effects: the real build (Supabase) drops it.
        treeshake: { moduleSideEffects: (id) => !id.includes('/src/data/mock/') },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      env: { TZ: 'UTC' },
    },
  }
})
