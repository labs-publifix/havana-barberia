import type { ReactNode } from 'react'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { business } from '@/config/business'
import { usePolicy } from '@/app/queries'
import type { BookingPolicy } from '@/domain/types'
import { durationText } from '@/lib/policy'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const UPDATED = 'noviembre de 2026'

/**
 * Final texts provided by the client (noviembre de 2026), kept word for word.
 * The booking numbers come from Ajustes › Políticas, so the page always says
 * what the system applies.
 */
const contentFor = (p: BookingPolicy): Record<'policies' | 'privacy', { title: string; body: ReactNode }> => ({
  policies: {
    title: 'Políticas de reserva',
    body: (
      <>
        <h2>Reservas</h2>
        <p>
          Puedes reservar sin crear una cuenta; solo necesitamos tu nombre, teléfono y correo electrónico. Las reservas
          las realizan personas mayores de edad. Si el servicio es para un menor, la reserva debe hacerla su madre, padre
          o tutor.
        </p>
        <p>
          Puedes agendar desde {durationText(p.minNoticeMin)} antes de la hora de tu cita y hasta con{' '}
          {plural(p.maxAdvanceDays, 'día', 'días')} de anticipación. Cada cliente puede tener hasta{' '}
          {plural(p.maxActiveAppointmentsPerCustomer, 'cita próxima activa', 'citas próximas activas')}. Al terminar
          recibirás por correo la confirmación con los detalles de tu cita y un enlace para administrarla.
        </p>
        <h2>Cancelaciones y cambios</h2>
        <p>
          Puedes cancelar o reprogramar tu cita sin costo hasta {durationText(p.changeCutoffMin)} antes, desde el enlace
          de tu correo de confirmación. Si ya pasó ese plazo, llámanos al <Phone /> y haremos lo posible por ayudarte.
        </p>
        <h2>Si necesitamos cambiar tu cita</h2>
        <p>
          Si por causas de la barbería o de tu barbero tenemos que mover o cancelar tu cita, te avisaremos lo antes
          posible por correo o teléfono y te ofreceremos un nuevo horario sin costo.
        </p>
        <h2>Puntualidad</h2>
        <p>
          Te esperamos con {p.toleranceMin} minutos de tolerancia. Pasado ese tiempo, el horario puede liberarse para
          atender a otro cliente. Si vas a llegar tarde, llámanos al <Phone /> y vemos cómo ayudarte.
        </p>
        <h2>Tarjeta de lealtad</h2>
        <p>
          Ganas un sello cada vez que completas una cita con un servicio participante; los servicios que participan están
          indicados en el sitio. Con {p.loyaltyGoal} sellos obtienes un corte gratis, válido por{' '}
          {plural(p.rewardValidityDays, 'día', 'días')} a partir de la fecha en que lo obtengas. Los sellos son
          personales, no se transfieren y no se canjean por dinero.
        </p>
        <h2>Pagos</h2>
        <p>No pedimos anticipo. Pagas en la barbería al terminar tu servicio.</p>
        <h2>¿Dudas?</h2>
        <p>
          Llámanos al <Phone /> o visítanos en {business.address}
        </p>
        <Updated />
      </>
    ),
  },
  privacy: {
    title: 'Aviso de privacidad',
    body: (
      <>
        <h2>Responsable de tus datos</h2>
        <p>
          {business.legalOwner}, persona física con actividad empresarial, que opera bajo el nombre comercial{' '}
          {business.name}, con domicilio en {business.address}, es responsable del tratamiento de tus datos personales,
          de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
        </p>
        <h2>Datos personales que recabamos</h2>
        <ul>
          <li>
            <strong>Identificación y contacto:</strong> nombre, teléfono y correo electrónico.
          </li>
          <li>
            <strong>Datos de tus citas:</strong> servicios, barbero, fechas y horarios, historial de citas y sellos de tu
            tarjeta de lealtad.
          </li>
          <li>
            <strong>Notas</strong> que tú decidas escribir sobre tu servicio.
          </li>
          <li>
            <strong>Datos técnicos mínimos</strong> de tu visita al sitio, como la dirección IP y el tipo de
            dispositivo, para su seguridad y funcionamiento.
          </li>
        </ul>
        <p>
          No recabamos datos personales sensibles. Te pedimos no incluir información de salud u otros datos sensibles en
          las notas de tu cita.
        </p>
        <p>
          Si reservas un servicio para un menor de edad, los datos del menor (como su nombre) son proporcionados por su
          madre, padre o tutor, quien declara contar con la facultad para hacerlo.
        </p>
        <h2>Para qué usamos tus datos</h2>
        <p>
          <strong>Finalidades necesarias para darte el servicio:</strong>
        </p>
        <ul>
          <li>Agendar, confirmar, reprogramar y cancelar tus citas.</li>
          <li>Enviarte recordatorios y avisarte si hay cambios en tu cita.</li>
          <li>Administrar tu historial de servicios y tu tarjeta de lealtad.</li>
          <li>Proteger el sitio contra abusos y mensajes no deseados.</li>
          <li>Cumplir con obligaciones legales.</li>
        </ul>
        <p>
          <strong>Finalidad voluntaria (solo si la aceptas):</strong>
        </p>
        <ul>
          <li>Enviarte promociones, novedades y beneficios de {business.name} por correo electrónico y WhatsApp.</li>
        </ul>
        <p>
          Para esta finalidad te pedimos tu consentimiento de forma separada, mediante una casilla que no está marcada de
          origen. Puedes retirarlo en cualquier momento, y no afecta tus citas ni los servicios que recibes. En cada
          mensaje promocional podrás darte de baja.
        </p>
        <h2>Con quién compartimos tus datos</h2>
        <p>
          No vendemos tus datos personales. Para operar el sistema de reservas nos apoyamos en proveedores que los tratan
          por nuestra cuenta y solo para ese fin:
        </p>
        <ul>
          <li>Alojamiento y base de datos del sistema (Supabase).</li>
          <li>Envío de correos de confirmación y recordatorio (Resend).</li>
          <li>Verificación contra spam y abusos (Cloudflare Turnstile).</li>
          <li>Si aceptas recibir promociones: envío de mensajes por correo electrónico y WhatsApp.</li>
        </ul>
        <p>
          Algunos de estos proveedores pueden almacenar o procesar información fuera de México. Fuera de estos casos, solo
          compartiremos tus datos si una autoridad competente lo exige conforme a la ley.
        </p>
        <h2>Tus derechos</h2>
        <p>
          Tienes derecho a acceder a tus datos, rectificarlos, cancelarlos u oponerte a su uso (derechos ARCO), así como a
          revocar tu consentimiento y a limitar el uso o la divulgación de tus datos.
        </p>
        <p>
          Para ejercerlos, escríbenos a{' '}
          <strong>
            <a href={`mailto:${business.email}`}>{business.email}</a>
          </strong>{' '}
          o llama al{' '}
          <strong>
            <Phone />
          </strong>
          , e indícanos:
        </p>
        <ol>
          <li>Tu nombre y un medio para responderte.</li>
          <li>El derecho que quieres ejercer y en qué consiste tu solicitud.</li>
          <li>Los datos o la cita a los que se refiere, para ubicarlos con facilidad.</li>
          <li>
            Una copia de una identificación oficial, para acreditar tu identidad (si actúas en nombre de otra persona, el
            documento que acredite tu representación).
          </li>
        </ol>
        <p>Te daremos respuesta dentro de los plazos que marca la ley. Ejercer tus derechos no tiene costo.</p>
        <h2>Cookies y herramientas de medición</h2>
        <p>
          Este sitio usa tecnologías necesarias para su funcionamiento, como las que mantienen tu sesión o tu reserva.
          Además, podemos usar herramientas de medición y analítica (como Google Analytics o Meta Pixel) para entender
          cómo se usa el sitio y mejorar nuestro servicio. Estas herramientas recaban datos como las páginas que visitas,
          el tipo de dispositivo y de navegador, y la forma en que llegaste al sitio. Solo se activan si las aceptas, y
          puedes rechazarlas o desactivarlas en cualquier momento desde tu navegador o desde las opciones de cookies del
          sitio, sin que se afecte tu reserva.
        </p>
        <h2>Conservación y seguridad</h2>
        <p>
          Conservamos tus datos mientras sigas siendo nuestro cliente y durante el tiempo que la ley exija; cuando ya no
          sean necesarios, los eliminamos o los dejamos de forma que no te identifiquen. Protegemos tus datos con medidas
          técnicas y administrativas, como conexión cifrada y acceso restringido solo al personal autorizado.
        </p>
        <h2>Menores de edad</h2>
        <p>
          Las reservas en este sitio las realizan únicamente personas mayores de edad. No recabamos de forma directa datos
          de menores; los cortes para niños se reservan por su madre, padre o tutor.
        </p>
        <h2>Cambios a este aviso</h2>
        <p>
          Publicaremos cualquier cambio a este aviso en esta página, con su fecha de actualización. Te recomendamos
          consultarla periódicamente.
        </p>
        <h2>Autoridad</h2>
        <p>
          Si consideras que tus derechos no fueron atendidos de manera adecuada, puedes acudir ante la Secretaría
          Anticorrupción y Buen Gobierno, autoridad en materia de protección de datos personales en posesión de
          particulares.
        </p>
        <Updated />
      </>
    ),
  },
})

function Phone() {
  return <a href={business.phoneHref}>{business.phoneDisplay}</a>
}

function Updated() {
  return <p className="mt-6 italic">Última actualización: {UPDATED}.</p>
}

export default function Legal({ kind }: { kind: 'policies' | 'privacy' }) {
  const { title, body } = contentFor(usePolicy())[kind]
  useDocumentTitle(title)
  return (
    <div data-theme="dark" className="min-h-dvh bg-page text-fg">
      <SkipLink />
      <SiteNav startFloating />
      <main
        id="contenido"
        tabIndex={-1}
        className="mx-auto grid max-w-2xl gap-6 px-4 pb-20 pt-32 outline-none md:pt-40"
      >
        <h1 className="t-h1">{title}</h1>
        <article className="grid gap-3 leading-[1.6] text-fg [&_h2]:mt-4 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-fg [&_li]:text-fg-muted [&_ol]:grid [&_ol]:list-decimal [&_ol]:gap-1.5 [&_ol]:pl-6 [&_p]:text-fg-muted [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-1.5 [&_ul]:pl-6">
          {body}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
