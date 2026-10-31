/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Injects <link rel="preload"> for the hero image so the LCP image starts
 * downloading in parallel with the JS bundle.
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
        const asset = Object.values(ctx.bundle ?? {}).find(
          (c) => c.type === 'asset' && /\/hero-[\w-]+\.(jpe?g|webp)$/.test(`/${c.fileName}`),
        )
        if (!asset) return html
        return {
          html,
          tags: [
            {
              tag: 'link',
              attrs: { rel: 'preload', as: 'image', href: `${base}${asset.fileName}`, fetchpriority: 'high' },
              injectTo: 'head',
            },
          ],
        }
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || '/havana-barberia/'
  return {
    base,
    plugins: [react(), preloadHero()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
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
