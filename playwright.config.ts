import { defineConfig, devices } from '@playwright/test'

const base = process.env.VITE_BASE ?? '/havana-barberia/'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:4173${base}`,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'mobile-360', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } }],
  webServer: {
    // Build exactly like CI (including the 404.html copy), then serve like GitHub Pages.
    command: 'npm run build && cp dist/index.html dist/404.html && node e2e/pages-server.mjs',
    url: `http://localhost:4173${base}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
