import type { Slot } from '@/domain/types'

/** Errors the UI knows how to explain. Implementations must throw these. */

export class SlotUnavailableError extends Error {
  readonly code = 'slot_unavailable'
  constructor(readonly alternatives: Slot[]) {
    super('Ese horario ya no está disponible.')
  }
}

export class BookingLimitError extends Error {
  readonly code = 'booking_limit'
  constructor(readonly limit: number) {
    super(`Ya tienes ${limit} citas próximas. Para agendar otra, cancela o espera a que pase una de ellas.`)
  }
}

export class ChangeWindowClosedError extends Error {
  readonly code = 'change_window_closed'
  constructor(readonly cutoffHours: number) {
    super(`Solo puedes cancelar o reprogramar hasta ${cutoffHours} horas antes de tu cita.`)
  }
}

export class NotFoundError extends Error {
  readonly code = 'not_found'
  constructor(what: string) {
    super(`No encontramos ${what}.`)
  }
}

export class InvalidRequestError extends Error {
  readonly code = 'invalid_request'
}
