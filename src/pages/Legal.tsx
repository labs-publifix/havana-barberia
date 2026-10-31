import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { SimpleHeader } from '@/components/layout/SimpleHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { Alert } from '@/components/ui/Alert'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { business } from '@/config/business'

const p = business.policy

/** DRAFT texts. Must be reviewed by a lawyer before launch. */
const content: Record<'policies' | 'privacy', { title: string; body: ReactNode }> = {
  policies: {
    title: 'Políticas de reserva',
    body: (
      <>
        <h2>Reservas</h2>
        <p>
          Reservas sin crear cuenta, solo con tu nombre, teléfono y correo. Puedes agendar desde {p.minNoticeMin / 60}{' '}
          hora antes y hasta {p.maxAdvanceDays} días después de hoy. Cada cliente puede tener hasta{' '}
          {p.maxActiveAppointmentsPerCustomer} citas próximas activas.
        </p>
        <h2>Cancelaciones y cambios</h2>
        <p>
          Puedes cancelar o reprogramar sin costo hasta {p.changeCutoffMin / 60} horas antes de tu cita, desde el enlace
          de tu cita. Después de ese plazo, llámanos al {business.phoneDisplay}.
        </p>
        <h2>Puntualidad</h2>
        <p>
          Te esperamos con {p.toleranceMin} minutos de tolerancia. Después, el horario puede liberarse para otro cliente
          y la cita se registra como no asistida.
        </p>
        <h2>Tarjeta de lealtad</h2>
        <p>
          Ganas un sello al completar una cita con un servicio participante. Con {p.loyaltyGoal} sellos obtienes un
          corte gratis, válido por {p.rewardValidityDays} días.
        </p>
        <h2>Pagos</h2>
        <p>No pedimos anticipo. Pagas en la barbería al terminar tu servicio.</p>
      </>
    ),
  },
  privacy: {
    title: 'Aviso de privacidad',
    body: (
      <>
        <h2>Responsable</h2>
        <p>
          {business.name}, con domicilio en {business.address}, es responsable del tratamiento de tus datos personales.
        </p>
        <h2>Datos que recabamos</h2>
        <p>Nombre, teléfono, correo electrónico y, si las escribes, notas sobre tu servicio.</p>
        <h2>Para qué los usamos</h2>
        <p>
          Para agendar, confirmar, recordarte y administrar tus citas, llevar tu tarjeta de lealtad y contactarte si hay
          cambios. No vendemos tus datos.
        </p>
        <h2>Tus derechos</h2>
        <p>
          Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos (derechos ARCO) escribiéndonos o llamando
          al {business.phoneDisplay}.
        </p>
        <h2>Cambios</h2>
        <p>Publicaremos cualquier cambio a este aviso en esta página.</p>
      </>
    ),
  },
}

export default function Legal({ kind }: { kind: 'policies' | 'privacy' }) {
  const navigate = useNavigate()
  const { title, body } = content[kind]
  useDocumentTitle(title)
  return (
    <div className="min-h-dvh bg-page">
      <SimpleHeader onBack={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />
      <main className="mx-auto grid max-w-booking gap-6 px-4 pb-12 pt-6">
        <h1 className="t-h1">{title}</h1>
        <Alert tone="warning" title="Borrador, pendiente de revisión legal.">
          Este texto es provisional y puede cambiar antes del lanzamiento.
        </Alert>
        <article className="grid gap-3 leading-[1.6] text-fg [&_h2]:mt-4 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_p]:text-fg-muted">
          {body}
        </article>
      </main>
      <SiteFooter tone="light" />
    </div>
  )
}
