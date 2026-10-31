import { z } from 'zod'
import { normalizeMxPhone } from '@/lib/phone'

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Escribe tu nombre (al menos 2 letras).').max(80, 'Usa un nombre más corto.'),
  phone: z
    .string()
    .trim()
    .min(1, 'Escribe tu teléfono.')
    .refine((v) => normalizeMxPhone(v) !== null, 'Revisa tu teléfono: deben ser 10 dígitos (ej. 442 123 4567).'),
  email: z.string().trim().min(1, 'Escribe tu correo.').email('Revisa el correo: falta algo (ej. nombre@correo.com).'),
  notes: z.string().max(300, 'Las notas pueden tener hasta 300 caracteres.'),
  privacyAccepted: z.boolean().refine((v) => v, 'Acepta el aviso de privacidad para continuar.'),
})

export type ContactForm = z.infer<typeof contactSchema>

export const emptyContact: ContactForm = { name: '', phone: '', email: '', notes: '', privacyAccepted: false }
