/**
 * Google reviews shown on the home marquee.
 *
 * Real reviews from Havana Barbería's Google profile, selected by the client
 * (positive ones). Rules:
 * - Text is verbatim. To fit the cards we only cut, marking each cut with "…";
 *   we never reword, correct or add to what a customer wrote.
 * - Names as published, abbreviated to first name + initial of the surname.
 * - Dates are omitted (relative dates like "hace 3 meses" go stale).
 * All selected reviews are 5 stars (confirmed by the client).
 */
export interface Review {
  id: string
  author: string
  text: string
  /** Stars as published on Google (1–5). */
  rating: 1 | 2 | 3 | 4 | 5
  isPlaceholder: boolean
}

const r = (id: string, author: string, text: string): Review => ({ id, author, text, rating: 5, isPlaceholder: false })

export const reviews: Review[] = [
  r(
    'diego-d',
    'Diego D.',
    'Excelente experiencia. El lugar está impecable, el servicio fue muy profesional y el barbero puso atención a cada detalle. El corte quedó justo como lo pedí…',
  ),
  r(
    'luis-g',
    'Luis G.',
    'Excelente atención por parte de Leonardo! Siempre me recibe con alguna bebida de cortesía, escucha al cliente y hace el corte según nuestro gusto…',
  ),
  r(
    'carlos-g',
    'Carlos Emilio G.',
    'Desde la primera vez me sorprendió la atención directa del propietario: cercana, profesional y siempre pendiente de cada detalle para que uno salga satisfecho.',
  ),
  r(
    'humberto-g',
    'Humberto G.',
    '¡Servicio de primer nivel! … La técnica con la navaja y el degradado son impecables. Se nota cuando alguien domina el oficio y cuida los detalles.',
  ),
  r(
    'aldair-g',
    'Aldair G.',
    'Desde que llego me reciben con amabilidad, el ambiente es cómodo y profesional, cuidan cada detalle. … sin duda, el servicio vale cada peso que pago.',
  ),
  r(
    'santiago-f',
    'Santiago F.',
    'Leo es un excelente barbero, siempre es atento con los clientes y tiene muy buen trato. La barbería siempre está limpia y tiene buen aspecto.',
  ),
  r(
    'adolfo-r',
    'Adolfo R.',
    'Tuve una grata recepción, me invitaron un sabroso café expreso, un lugar ordenado y limpio. El corte de pelo fue de acuerdo a lo solicitado…',
  ),
  r(
    'anne-t',
    'Anne T.',
    'Excelente el corte para mis hijos. Lo hicieron detalladamente, con el estilo que ellos pidieron, la atención de lo mejor!!',
  ),
  r(
    'edifica',
    'Edifica del Bajío',
    'Excelente servicio. Fui por un corte de cabello y barba, y el barbero se tomó el tiempo de entender exactamente lo que quería…',
  ),
  r(
    'arturo-c',
    'Arturo C.',
    'Excelente trato, muy profesional por parte de Leo, tiene experiencia, trabaja muy bien los cortes tanto de adulto como niño. Lo Recomiendo ampliamente',
  ),
  r(
    'salvador-f',
    'Salvador F.',
    'Excelente servicio. Corte bien hecho, con atención al detalle y buen trato. Se nota la experiencia. Totalmente recomendable.',
  ),
  r(
    'rodrigo-m',
    'Rodrigo M.',
    'Muy satisfecho con el corte que me hicieron, primera vez que voy pero no la última. Vale la pena el precio por el buen trabajo realizado.',
  ),
  r(
    'ivan-p',
    'Iván P.',
    'Excelente servicio, limpieza, orden y puntualidad. Leo es muy profesional y te guía para mejores resultados, lo recomiendo ampliamente.',
  ),
  r(
    'andrea-b',
    'Andrea B.',
    'Excelente servicio!! Acompañé a mi novio a cortarse el cabello y nos trataron súper bien. Excelente diseño del local, barberos súper presentables y súper rápido…',
  ),
  r(
    'jose-j',
    'José J.',
    'Excelente lugar para cortarse el pelo y barba, te entienden a la primera y queda perfecto, no dudes en darle una oportunidad',
  ),
  r(
    'osvaldo-v',
    'Osvaldo V.',
    'Excelente atención, lugar muy limpio 100% recomendado. La pomada para peinar y su shampoo increíble',
  ),
]
