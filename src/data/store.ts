import { DEFAULT_DATA } from './defaults'
import type { Appointment, AppointmentStatus, Barber, BusinessSettings, DataSnapshot, NewAppointment, Service } from './types'
import { availableSlots } from '../lib/time'

/**
 * Capa de datos. Hoy guarda todo en el navegador (localStorage) para poder
 * probar el sistema sin servidor. Para producción se reemplaza esta clase por
 * una que hable con un backend (p. ej. Supabase) manteniendo la misma interfaz:
 * las pantallas no tienen que cambiar.
 */
export interface Repository {
  load(): Promise<DataSnapshot>
  book(input: NewAppointment, now?: Date): Promise<Appointment>
  setStatus(id: string, status: AppointmentStatus): Promise<void>
  saveService(s: Service): Promise<void>
  deleteService(id: string): Promise<void>
  saveBarber(b: Barber): Promise<void>
  deleteBarber(id: string): Promise<void>
  saveSettings(s: BusinessSettings): Promise<void>
  reset(): Promise<void>
}

export class SlotTakenError extends Error {
  constructor() {
    super('Ese horario ya no está disponible. Elige otro.')
  }
}

const KEY = 'havana-barberia:v1'

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

export interface KeyValue {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export class LocalRepository implements Repository {
  constructor(private kv: KeyValue) {}

  private read(): DataSnapshot {
    try {
      const raw = this.kv.getItem(KEY)
      if (raw) return { ...clone(DEFAULT_DATA), ...JSON.parse(raw) }
    } catch {
      /* dato corrupto o almacenamiento bloqueado: se usan los valores iniciales */
    }
    return clone(DEFAULT_DATA)
  }

  private write(d: DataSnapshot) {
    this.kv.setItem(KEY, JSON.stringify(d))
  }

  private mutate(fn: (d: DataSnapshot) => void) {
    const d = this.read()
    fn(d)
    this.write(d)
  }

  async load() {
    return this.read()
  }

  async book(input: NewAppointment, now = new Date()) {
    const d = this.read()
    const service = d.services.find((s) => s.id === input.serviceId && s.active)
    const barber = d.barbers.find((b) => b.id === input.barberId)
    if (!service || !barber) throw new Error('Servicio o barbero no disponible.')
    const free = availableSlots({
      date: input.date,
      durationMin: service.durationMin,
      barber,
      settings: d.settings,
      appointments: d.appointments,
      now,
    })
    if (!free.includes(input.start)) throw new SlotTakenError()
    const appt: Appointment = {
      ...input,
      id: newId(),
      durationMin: service.durationMin,
      price: service.price,
      status: 'confirmada',
      createdAt: now.toISOString(),
    }
    d.appointments.push(appt)
    this.write(d)
    return appt
  }

  async setStatus(id: string, status: AppointmentStatus) {
    this.mutate((d) => {
      const a = d.appointments.find((x) => x.id === id)
      if (a) a.status = status
    })
  }

  async saveService(s: Service) {
    this.mutate((d) => upsert(d.services, s))
  }

  async deleteService(id: string) {
    this.mutate((d) => {
      d.services = d.services.filter((s) => s.id !== id)
    })
  }

  async saveBarber(b: Barber) {
    this.mutate((d) => upsert(d.barbers, b))
  }

  async deleteBarber(id: string) {
    this.mutate((d) => {
      d.barbers = d.barbers.filter((b) => b.id !== id)
    })
  }

  async saveSettings(s: BusinessSettings) {
    this.mutate((d) => {
      d.settings = s
    })
  }

  async reset() {
    this.kv.removeItem(KEY)
  }
}

function upsert<T extends { id: string }>(list: T[], item: T) {
  const i = list.findIndex((x) => x.id === item.id)
  if (i === -1) list.push(item)
  else list[i] = item
}

export class MemoryKV implements KeyValue {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

function browserKV(): KeyValue {
  try {
    const t = '__t'
    localStorage.setItem(t, t)
    localStorage.removeItem(t)
    return localStorage
  } catch {
    return new MemoryKV()
  }
}

export const repo: Repository = new LocalRepository(typeof window === 'undefined' ? new MemoryKV() : browserKV())
