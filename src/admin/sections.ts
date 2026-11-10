import {
  BarChart3,
  CalendarDays,
  Component,
  HandCoins,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  Scissors,
  Settings,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react'
import type { AdminRole } from './domain'

export type SectionId =
  | 'inicio'
  | 'agenda'
  | 'clientes'
  | 'ventas'
  | 'catalogo'
  | 'equipo'
  | 'comisiones'
  | 'cierre'
  | 'reportes'
  | 'ajustes'
  | 'componentes'

export interface Section {
  id: SectionId
  label: string
  /** Label when a barber sees it (their own data). */
  barberLabel?: string
  icon: LucideIcon
  roles: AdminRole[]
  /** Roadmap delivery (docs/ROADMAP.md) that builds this section. */
  delivery: number
  summary: string
  /** What the section will let people do; shown until it is built. */
  features: string[]
}

const all: AdminRole[] = ['owner', 'developer', 'manager', 'reception', 'barber']
const desk: AdminRole[] = ['owner', 'developer', 'manager', 'reception']
const finance: AdminRole[] = ['owner', 'developer', 'manager']

export const sections: Record<SectionId, Section> = {
  inicio: {
    id: 'inicio',
    label: 'Vista general',
    icon: LayoutDashboard,
    roles: all,
    delivery: 2,
    summary: 'El día de un vistazo, pensado para la pantalla de la barbería.',
    features: [
      'Citas de hoy y la siguiente en turno',
      'Ocupación por barbero',
      'Alertas: no-shows, bloqueos y citas sin confirmar',
    ],
  },
  agenda: {
    id: 'agenda',
    label: 'Agenda',
    barberLabel: 'Mi agenda',
    icon: CalendarDays,
    roles: all,
    delivery: 3,
    summary: 'Día y semana por barbero, con todo lo que pasa en cada cita.',
    features: [
      'Vista de día y de semana por barbero',
      'Completar (otorga el sello), no-show, cancelar y reprogramar',
      'Crear cita o walk-in y bloquear horarios',
    ],
  },
  clientes: {
    id: 'clientes',
    label: 'Clientes',
    icon: Users,
    roles: desk,
    delivery: 4,
    summary: 'Búsqueda rápida y ficha de cada cliente.',
    features: ['Búsqueda por nombre, teléfono o correo', 'Historial de citas y no-shows', 'Tarjeta de sellos'],
  },
  ventas: {
    id: 'ventas',
    label: 'Ventas',
    icon: ReceiptText,
    roles: desk,
    delivery: 8,
    summary: 'Tickets de la semana, venta de productos y caja del día.',
    features: [
      'Ticket con servicios y productos',
      'Pagos mixtos, propinas y descuentos con autorización',
      'Una cita completada puede generar su venta',
    ],
  },
  catalogo: {
    id: 'catalogo',
    label: 'Servicios y precios',
    icon: Scissors,
    roles: desk,
    delivery: 5,
    summary: 'Todo lo que aparece en el sitio y en la reserva sale de aquí.',
    features: [
      'Servicios, categorías, duración y precio',
      'Orden en el sitio y servicios activos',
      'Qué barbero realiza cada servicio',
    ],
  },
  equipo: {
    id: 'equipo',
    label: 'Equipo y horarios',
    icon: UserRound,
    roles: desk,
    delivery: 6,
    summary: 'Quién trabaja y cuándo; de aquí sale la disponibilidad.',
    features: ['Barberos y su perfil', 'Horario semanal de cada uno', 'Vacaciones, comidas y festivos'],
  },
  comisiones: {
    id: 'comisiones',
    label: 'Comisiones y bonos',
    barberLabel: 'Mis comisiones',
    icon: HandCoins,
    roles: ['owner', 'developer', 'manager', 'barber'],
    delivery: 8,
    summary: 'Lo que gana cada barbero por semana, según su comisión.',
    features: [
      'Comisión por servicio y barbero',
      'Bonos de puntualidad, asistencia y venta de producto',
      'Cambiar una regla crea una vigencia nueva; el historial no se reescribe',
    ],
  },
  cierre: {
    id: 'cierre',
    label: 'Cierre y nómina',
    icon: Wallet,
    roles: finance,
    delivery: 8,
    summary: 'Cierre semanal, bonos, anticipos y recibos.',
    features: ['Ventas por forma de pago y salidas', 'Anticipos', 'Recibo semanal por barbero'],
  },
  reportes: {
    id: 'reportes',
    label: 'Reportes',
    icon: BarChart3,
    roles: finance,
    delivery: 8,
    summary: 'Indicadores del negocio y comparativos.',
    features: ['Ventas y citas por periodo', 'Desempeño por barbero', 'Clientes nuevos y recurrentes'],
  },
  ajustes: {
    id: 'ajustes',
    label: 'Ajustes',
    icon: Settings,
    roles: finance,
    delivery: 7,
    summary: 'Políticas del negocio y accesos del equipo.',
    features: [
      'Políticas de reserva: anticipación, cancelación, tolerancia y límites',
      'Programa de lealtad: sellos, servicios elegibles y vigencia',
      'Usuarios y roles',
    ],
  },
  componentes: {
    id: 'componentes',
    label: 'Componentes',
    icon: Component,
    roles: finance,
    delivery: 1,
    summary: 'Piezas base del panel para revisar en contexto.',
    features: [],
  },
}

export interface NavGroup {
  label: string
  items: SectionId[]
}

export const navGroups: NavGroup[] = [
  { label: 'Operación', items: ['inicio', 'agenda', 'clientes', 'ventas'] },
  { label: 'Negocio', items: ['catalogo', 'equipo'] },
  { label: 'Finanzas', items: ['comisiones', 'cierre', 'reportes'] },
  { label: 'Sistema', items: ['ajustes', 'componentes'] },
]

/** The components workbench shows in dev and in the preview build (same flag as /__ui). */
export const showWorkbench = import.meta.env.DEV || import.meta.env.VITE_UI_GALLERY === 'true'

export const canAccess = (role: AdminRole, id: SectionId) => sections[id].roles.includes(role)

export const sectionLabel = (id: SectionId, role: AdminRole) =>
  (role === 'barber' && sections[id].barberLabel) || sections[id].label

/** Nav groups filtered to what a role can open (empty groups dropped). */
export const navFor = (role: AdminRole, opts: { showWorkbench: boolean }) =>
  navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((id) => canAccess(role, id) && (id !== 'componentes' || opts.showWorkbench)),
    }))
    .filter((g) => g.items.length > 0)

export const isSectionId = (s: string | undefined): s is SectionId => !!s && s in sections
