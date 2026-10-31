import type { DataSnapshot } from './types'

// Datos iniciales de ejemplo. Se editan desde el panel de administración.
export const DEFAULT_DATA: DataSnapshot = {
  services: [
    { id: 'corte', name: 'Corte clásico', description: 'Tijera y máquina, lavado y peinado.', durationMin: 45, price: 250, active: true },
    { id: 'fade', name: 'Fade', description: 'Degradado a navaja con acabado limpio.', durationMin: 45, price: 280, active: true },
    { id: 'barba', name: 'Arreglo de barba', description: 'Perfilado, toalla caliente y aceite.', durationMin: 30, price: 180, active: true },
    { id: 'combo', name: 'Corte + barba', description: 'El servicio completo de la casa.', durationMin: 75, price: 400, active: true },
    { id: 'nino', name: 'Corte infantil', description: 'Para menores de 12 años.', durationMin: 30, price: 180, active: true },
  ],
  barbers: [
    { id: 'b1', name: 'Barbero 1', bio: 'Edita nombre y descripción en el panel.', active: true, workDays: [2, 3, 4, 5, 6] },
    { id: 'b2', name: 'Barbero 2', bio: 'Edita nombre y descripción en el panel.', active: true, workDays: [1, 2, 3, 5, 6] },
  ],
  settings: {
    name: 'Havana Barbería',
    phone: '',
    address: '',
    hours: [
      null,
      { open: '10:00', close: '20:00' },
      { open: '10:00', close: '20:00' },
      { open: '10:00', close: '20:00' },
      { open: '10:00', close: '20:00' },
      { open: '10:00', close: '20:00' },
      { open: '09:00', close: '18:00' },
    ],
    slotStepMin: 15,
    minNoticeMin: 60,
    bookingWindowDays: 30,
  },
  appointments: [],
}
