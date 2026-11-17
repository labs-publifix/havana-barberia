/**
 * Leonardo Gómez Ríos, founder of Havana Barbería: content of his profile page
 * (/barberos/leonardo-gomez-rios). Text approved by Leo (noviembre de 2026),
 * edited only for spelling and accuracy: the shop's address is the one on the
 * site, «tratamientos de reconstrucción capilar» and no promises about product
 * results (COFEPRIS). Photos live in public/img with descriptive names
 * (scripts/optimize-assets.py). No imports: vite.config.ts reads this file.
 */

export const FOUNDER_PATH = '/barberos/leonardo-gomez-rios'

/**
 * Leonardo among the barbers of the panel (Equipo), for «Reserva con
 * Leonardo» and «Conoce su historia». Ids are random in the database, so by
 * name (the demo uses the id 'leonardo').
 */
export const isFounderStaff = (s: { id: string; name: string }) =>
  s.id === 'leonardo' ||
  /^leonardo( |$)/.test(
    s.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase(),
  )

export interface StoryImage {
  /** Public path without the width suffix, e.g. /img/leonardo-gomez-rios-inicios-cuba */
  base: string
  /** Available widths, smallest first (one when the original is small). */
  widths: number[]
  /** Height / width. */
  ratio: number
  alt: string
  caption: string
}

export interface Milestone {
  /** Short marker on the line: a year or a moment. */
  when: string
  place: string
  title: string
  paragraphs: string[]
  image?: StoryImage
}

export const founder = {
  name: 'Leonardo Gómez Ríos',
  givenName: 'Leonardo',
  familyName: 'Gómez Ríos',
  alternateNames: ['Leo Gómez', 'Leonardo Gómez'],
  role: 'Barbero profesional, emprendedor y formulador cosmético',
  jobTitle: 'Barbero profesional y formulador cosmético',
  lede: 'Barbero y estilista de origen cubano, con el oficio en las manos desde los 12 años. Hoy dirige Havana Barbería en Querétaro y formula Cubita, su propia línea para el cuidado del cabello y la barba.',
  intro:
    'Leonardo Gómez Ríos es barbero profesional, estilista y formulador cosmético de origen cubano, radicado actualmente en Querétaro, México. Su vocación por el oficio comenzó a los 12 años, edad en la que realizó sus primeros cortes de cabello y descubrió una pasión que ha perfeccionado de manera ininterrumpida a lo largo de los años.',
  facts: [
    { label: 'Origen', value: 'Cuba' },
    { label: 'En el oficio desde', value: 'los 12 años' },
    { label: 'En México desde', value: '2023' },
    { label: 'Fundador de', value: 'Havana Barbería y Cubita' },
  ],
  hero: {
    base: '/img/leonardo-gomez-rios-barbero-havana-barberia',
    widths: [800, 1600],
    ratio: 1066 / 1600,
    alt: 'Leonardo Gómez Ríos cortando el cabello con tijera a un cliente en Havana Barbería, Querétaro',
    caption: 'Leonardo en Havana Barbería, Querétaro.',
  } satisfies StoryImage,
  timeline: [
    {
      when: '12 años',
      place: 'Cuba',
      title: 'Los primeros cortes',
      paragraphs: ['Hizo sus primeros cortes de cabello y supo que ese sería su oficio.'],
    },
    {
      when: 'Sus inicios',
      place: 'Cuba',
      title: 'Un sillón hecho a mano',
      paragraphs: [
        'Sus inicios estuvieron marcados por la resiliencia y el amor al oficio. En Cuba, emprender en la barbería es un reto constante por la escasez y la enorme dificultad para conseguir máquinas, utensilios e insumos profesionales.',
        'Lejos de detenerse ante estas limitaciones, Leonardo comenzó atendiendo a sus clientes desde el portal de su casa. Al no poder adquirir un sillón de barbería tradicional, reunió sus propios recursos y, con la ayuda de un amigo soldador, mandó fabricar artesanalmente su propio sillón. Ese espacio se convirtió en el punto de partida de su carrera y en la prueba de que la determinación supera cualquier carencia material.',
      ],
      image: {
        base: '/img/leonardo-gomez-rios-inicios-cuba',
        widths: [640, 1053],
        ratio: 1600 / 1053,
        alt: 'Leonardo Gómez Ríos en sus inicios en Cuba, cortando el cabello a un cliente en un sillón de barbero de metal',
        caption: 'Sus inicios en Cuba.',
      },
    },
    {
      when: '2014',
      place: 'La Habana',
      title: 'El Vedado y el servicio completo',
      paragraphs: [
        'Con esa misma visión de superación, y con el deseo de crear su propia línea de productos capilares, en 2014 se trasladó a La Habana. Ahí dio un paso clave en su evolución profesional al integrarse como barbero en una reconocida peluquería de El Vedado.',
        'En ese espacio consolidó un servicio de barbería integral con una terminación impecable: cada corte incluía lavado capilar, secado, moldeado técnico con secadora y la aplicación de productos profesionales de fijación, para que cada cliente saliera plenamente satisfecho.',
        'Esa etapa también amplió sus horizontes hacia el estilismo femenino, donde dominó técnicas avanzadas de corte, colorimetría, queratinas y tratamientos de reconstrucción capilar, mientras seguía impulsando su emprendimiento independiente.',
      ],
      image: {
        base: '/img/leonardo-gomez-rios-barbero',
        widths: [640, 1200],
        ratio: 1508 / 1200,
        alt: 'Leonardo Gómez Ríos perfilando la barba de un cliente con máquina',
        caption: 'Precisión en cada detalle, del corte a la barba.',
      },
    },
    {
      when: '2023',
      place: 'Querétaro, México',
      title: 'Havana Barbería y Cubita',
      paragraphs: [
        'En 2023 dio el salto decisivo al mudarse a México, donde materializó su visión empresarial con la apertura de Havana Barbería en Santiago de Querétaro.',
        'De forma paralela fundó y formuló Cubita, una línea especializada de productos profesionales para el cuidado y tratamiento del cabello y la barba.',
      ],
      image: {
        base: '/img/havana-barberia-interior-queretaro',
        widths: [382],
        ratio: 510 / 382,
        alt: 'Interior de Havana Barbería en Querétaro: sillones de barbero negros y dorados bajo luces hexagonales',
        caption: 'Havana Barbería hoy, en Santiago de Querétaro.',
      },
    },
    {
      when: 'Hoy',
      place: 'Querétaro, México',
      title: 'Servicio completo y acabado profesional',
      paragraphs: [
        'Gracias a su formación integral, su exigencia por el detalle y su conocimiento de lo que significa contar con herramientas e insumos confiables, Leonardo ha centrado el desarrollo de Cubita en fórmulas con activos de alta concentración, desarrolladas para el uso diario en barbería.',
        'Hoy, desde Querétaro, lidera la atención especializada en Havana Barbería —con esa misma cultura de servicio completo y acabado profesional— junto con la formulación, producción y distribución de su propia línea capilar: Cubita.',
      ],
    },
  ] satisfies Milestone[],
  /** What a cut with him includes (from his years in El Vedado to today). */
  craft: ['Lavado capilar', 'Secado', 'Moldeado con secadora', 'Fijación profesional'],
  knowsAbout: [
    'Barbería',
    'Corte de cabello para caballero',
    'Arreglo y perfilado de barba',
    'Estilismo',
    'Colorimetría',
    'Queratina',
    'Tratamientos de reconstrucción capilar',
    'Formulación cosmética',
  ],
  brand: {
    name: 'Cubita',
    description: 'Línea de productos profesionales para el cuidado y tratamiento del cabello y la barba.',
  },
}

/** srcset for a public story image. */
export const storySrcSet = (img: StoryImage) => img.widths.map((w) => `${img.base}-${w}.webp ${w}w`).join(', ')
export const storySrc = (img: StoryImage) => `${img.base}-${img.widths[0]}.webp`
