import { describe, expect, it } from 'vitest'
import { canAccess, navFor, sectionLabel, sections, type SectionId } from './sections'

const ids = Object.keys(sections) as SectionId[]
const visible = (role: Parameters<typeof navFor>[0], showWorkbench = true) =>
  navFor(role, { showWorkbench }).flatMap((g) => g.items)

describe('admin permissions', () => {
  it('owner and manager open every section', () => {
    for (const id of ids) {
      expect(canAccess('owner', id)).toBe(true)
      expect(canAccess('manager', id)).toBe(true)
    }
  })

  it('finance is only for owner and manager (barbers see their own commissions)', () => {
    for (const id of ['cierre', 'reportes', 'ajustes'] as const) {
      expect(canAccess('reception', id)).toBe(false)
      expect(canAccess('barber', id)).toBe(false)
    }
    expect(canAccess('reception', 'comisiones')).toBe(false)
    expect(canAccess('barber', 'comisiones')).toBe(true)
  })

  it('a barber only sees the overview, their agenda and their commissions', () => {
    expect(visible('barber')).toEqual(['inicio', 'agenda', 'comisiones'])
    expect(sectionLabel('agenda', 'barber')).toBe('Mi agenda')
    expect(sectionLabel('agenda', 'reception')).toBe('Agenda')
  })

  it('reception runs the day but not finances or settings', () => {
    expect(visible('reception')).toEqual(['inicio', 'agenda', 'clientes', 'ventas', 'catalogo', 'equipo'])
  })

  it('hides the components workbench when the flag is off and drops empty groups', () => {
    expect(visible('owner', false)).not.toContain('componentes')
    expect(navFor('barber', { showWorkbench: true }).map((g) => g.label)).toEqual(['Operación', 'Finanzas'])
  })

  it('every upcoming section explains what it will do', () => {
    for (const id of ids.filter((x) => x !== 'componentes')) expect(sections[id].features.length).toBeGreaterThan(0)
  })
})
