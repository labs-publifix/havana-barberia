/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

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
        const hero = files.find((f) => /(^|\/)hero-[\w-]+\.(jpe?g|webp)$/.test(f))
        // The display heading uses Geist 700: fetch it early so the LCP text does not wait.
        const font = files.find((f) => /geist-sans-latin-700-normal-[\w-]+\.woff2$/.test(f))
        const tags = [
          ...(hero
            ? [
                {
                  tag: 'link',
                  attrs: { rel: 'preload', as: 'image', href: `${base}${hero}`, fetchpriority: 'high' },
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
