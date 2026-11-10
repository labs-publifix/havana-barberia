import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Recent Node versions ship their own (disabled) Web Storage globals that can shadow
// jsdom's, leaving localStorage/sessionStorage undefined. Provide an in-memory one.
class MemoryStorage implements Storage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  clear() {
    this.m.clear()
  }
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
}
// Tests that run in Node (`// @vitest-environment node`) skip the browser set-up.
const browser = typeof window !== 'undefined'
if (browser) {
  // jsdom lacks these browser APIs used by the UI.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  Element.prototype.scrollIntoView = vi.fn()
  // Radix (tooltip, popover, select) measures elements with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  // Radix Select uses pointer capture.
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    let ok = false
    try {
      ok = typeof globalThis[name]?.clear === 'function'
    } catch {
      ok = false
    }
    if (!ok) {
      const storage = new MemoryStorage()
      Object.defineProperty(globalThis, name, { value: storage, configurable: true, writable: true })
      Object.defineProperty(window, name, { value: storage, configurable: true, writable: true })
    }
  }
}

afterEach(() => {
  if (!browser) return
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})
