import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom lacks these browser APIs used by the UI.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
Element.prototype.scrollIntoView = vi.fn()

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

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
})
