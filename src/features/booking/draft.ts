import { emptyContact, type ContactForm } from './schema'

/**
 * Contact details typed in step 4 survive going back, reloads and the summary
 * screen. Kept in sessionStorage (this tab only) and cleared after booking.
 */
const KEY = 'havana:booking-contact'

export function loadContact(): ContactForm {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? { ...emptyContact, ...(JSON.parse(raw) as Partial<ContactForm>) } : emptyContact
  } catch {
    return emptyContact
  }
}

export function saveContact(values: ContactForm) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(values))
  } catch {
    /* private mode or storage blocked: the form still works in memory */
  }
}

export function clearContact() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
