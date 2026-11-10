// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error plain ESM script without types
import { bundleEngine } from '../../scripts/build-engine.mjs'

describe('booking engine for the Edge Functions', () => {
  it('supabase/functions/_shared/engine.js is up to date with src/lib (run `npm run engine`)', async () => {
    const committed = readFileSync(resolve(__dirname, '../../supabase/functions/_shared/engine.js'), 'utf8')
    expect(committed).toBe(await bundleEngine())
  })
})
