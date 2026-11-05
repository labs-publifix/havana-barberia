# Arquitectura · Hito 1A

Aplicación estática (Vite + React 18 + TypeScript) publicada en GitHub Pages. No hay servidor propio: hoy los datos son de demostración y viven en el navegador.

```
src/
  domain/types.ts            Tipos del dominio (Service, Staff, Appointment, LoyaltyCard, BookingPolicy…)
  config/business.ts         Datos del negocio, horario y políticas (nunca fijos en componentes)
  lib/availability/          Motor de disponibilidad: función pura + pruebas
  lib/time.ts                Fechas y horas siempre en America/Mexico_City
  data/
    BookingRepository.ts     Interfaz: lo único que la UI conoce
    errors.ts                Errores de negocio que la UI sabe explicar
    index.ts                 Fábrica: elige la implementación por VITE_DATA_SOURCE
    mock/                    MockBookingRepository + datos semilla
  app/                       Providers, hooks de TanStack Query, rutas
  components/                ui/ (base), booking/ (piezas de reserva), layout/
  features/                  booking/ (paso de fecha y hora, formulario), appointment/
  pages/                     Una pantalla por ruta (las secundarias se cargan bajo demanda)
```

## Flujo de datos

```
Pantalla ──(hooks de TanStack Query)──▶ BookingRepository ──▶ MockBookingRepository  (hoy)
                                                         └──▶ SupabaseBookingRepository (hito 1B)
```

La UI nunca importa datos directamente: pide todo a `BookingRepository` mediante `useRepository()` y los hooks de `src/app/queries.ts`. Las pantallas no saben de dónde vienen los datos.

### `MockBookingRepository`

- Guarda todo en memoria y lo persiste en `localStorage` (`havana:mock-db`) dentro de `try/catch`. Si el almacenamiento está bloqueado, sigue funcionando en memoria.
- Al primer uso genera la semilla: 14 servicios en 5 categorías, 2 barberos con horarios propios, 10 días de citas de ejemplo con huecos, un bloqueo, la cita `demo-cita` y la tarjeta `demo-lealtad` (6 de 10 sellos).
- Las escrituras pasan por una cola: cada `createAppointment` / `rescheduleAppointment` vuelve a calcular la disponibilidad justo antes de guardar. Por eso dos reservas simultáneas nunca ocupan el mismo horario: la segunda recibe `SlotUnavailableError` con los horarios más cercanos.
- Aplica las mismas reglas que tendrá el backend: anticipación de 1 h a 30 días, límite de 2 citas futuras por cliente y cambios hasta 4 h antes.
- Simula 350 ms de latencia para que se vean los estados de carga.

### Motor de disponibilidad (`src/lib/availability`)

`computeSlots()` es una función pura: recibe la fecha, la duración (suma de servicios), los barberos candidatos, el horario, la política, las citas, los bloqueos y `now`, y devuelve la cuadrícula de 15 minutos con `available` y el barbero asignado. Nunca depende del huso horario del dispositivo. En Supabase se puede portar a una función SQL o a una Edge Function, y estas pruebas sirven como especificación.

## Cómo agregar Supabase (hito 1B)

1. Crear `src/data/supabase/SupabaseBookingRepository.ts` que implemente `BookingRepository`:
   - `listServices`, `listStaff` y `getLoyaltyCardByToken` leen tablas con RLS de solo lectura.
   - `getAvailableSlots` llama a una función RPC de disponibilidad.
   - `createAppointment`, `cancelAppointment` y `rescheduleAppointment` llaman a **Edge Functions**. Ahí se validan los datos, se aplican los límites y Turnstile, y se usa la llave de servicio, que nunca llega al navegador.
   - Convertir las filas `snake_case` a los tipos de `src/domain/types.ts` y lanzar los errores de `src/data/errors.ts` (`SlotUnavailableError`, `ChangeWindowClosedError`, `BookingLimitError`) para que la UI siga mostrando los mensajes correctos.
2. En `src/data/index.ts` agregar `case 'supabase': return new SupabaseBookingRepository(...)`.
3. Definir `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como variables del workflow. Solo la llave **anon** es pública.
4. En la base: restricción de exclusión sobre `(staff_id, tstzrange(starts_at, ends_at))` para que Postgres impida dobles citas aunque fallen otras capas.
5. Mover `config/business.ts` (horario y políticas) a la tabla `settings` y exponerlo con un método nuevo del repositorio cuando el panel permita editarlo.

Ninguna pantalla debería cambiar.

## Despliegue

- `VITE_BASE` define la ruta base (`/havana-barberia/` hoy, `/` con dominio propio). Router, recursos y enlaces la respetan.
- `.github/workflows/deploy.yml`: en cada push a `main` corre lint, typecheck, pruebas y build, copia `index.html` a `404.html` (Pages no reescribe rutas, así que las rutas profundas cargan la app) y publica con `deploy-pages`.
- Las rutas profundas responden HTTP 404 con la app completa: es como funciona Pages. Con dominio propio se puede evaluar Cloudflare Pages para tener rewrites reales.
- `/__ui` (galería de componentes) se activa con `VITE_UI_GALLERY=true`. Hoy está prendido porque la URL de Pages es la vista previa; apagarlo en producción.

## Pruebas

| Qué                                                                   | Dónde                                       | Comando                     |
| --------------------------------------------------------------------- | ------------------------------------------- | --------------------------- |
| Motor de disponibilidad, repositorio mock, utilidades                 | `src/**/*.test.ts`                          | `npm test`                  |
| Flujo de reserva, administrar cita, portada (Testing Library)         | `src/pages/*.test.tsx`, `src/components/**` | `npm test`                  |
| Recorridos móviles a 360 px, rutas profundas, teclado, zonas táctiles | `e2e/booking.spec.ts`                       | `npm run e2e`               |
| Capturas 360/390/768/1280 en `docs/screenshots/`                      | `e2e/screenshots.spec.ts`                   | `SCREENSHOTS=1 npm run e2e` |

Playwright construye la app igual que CI y la sirve con `e2e/pages-server.mjs`, que imita a GitHub Pages: sin reescrituras, `404.html` como respaldo y gzip.

## Panel administrativo (`/admin`)

Vive en `src/admin/` y se carga como un bloque aparte (`AdminApp`, carga diferida), así el sitio público no lo descarga.

```
Pantallas del panel ──▶ AdminRepository ──▶ MockAdminRepository     (hoy)
                                         └──▶ SupabaseAdminRepository (hito 1C)
```

- **`sections.ts`** es la única fuente de las secciones: etiqueta, icono, roles con acceso, entrega del roadmap y qué hará cada una. De ahí salen la navegación, los permisos (`canAccess`) y las fichas de las secciones que aún no se construyen.
- **Roles** (`domain.ts`): dueño y gerente ven todo (finanzas incluidas) y usan verificación en dos pasos; recepción opera agenda, clientes, ventas, catálogo y equipo; el barbero solo ve su vista general, su agenda y sus comisiones.
- **Acceso simulado:** `MockAdminRepository` acepta los usuarios de demostración (`*@havana.test`, contraseña `demo1234`) y cualquier código de 6 dígitos. La pantalla de entrada ofrece un acceso directo por rol. Los permisos de la UI solo dan forma a la interfaz: la seguridad real será Supabase Auth + RLS.
- **Componentes de trabajo** (`src/admin/ui`): controles densos (40 px en escritorio, 44 px en pantallas táctiles, texto de 16 px), `DataTable` (orden accesible, fila que abre con Tab + Enter), `SidePanel` (Radix Dialog lateral), `Toast`, `Card`, `StatCard`, `EmptyState`. Se revisan en `/admin/componentes` (solo en desarrollo y en la vista previa).
- **Diseño:** escritorio primero (pantalla grande de la barbería) y responsive: barra lateral fija desde 1024 px y menú lateral desplegable debajo. Columna lateral oscura con el logo blanco; contenido claro; aqua solo para el indicador de sección activa y estados.
- **Conectar Supabase:** implementar `AdminRepository` (`signIn` → `auth.signInWithPassword`, `verifyMfa` → `auth.mfa.challengeAndVerify`, `listUsers` → tabla de perfiles con RLS) y agregar el `case 'supabase'` en `src/admin/data/index.ts`.

### Vista general (`/admin/inicio`)

- **Datos compartidos con el sitio público:** en modo mock, `MockAdminRepository` lee del mismo `MockBookingRepository` que usa `/reservar` (`snapshot()`), así una reserva hecha en el sitio aparece en el panel. `getAgendaDay(fecha)` devuelve barberos, servicios, citas, bloqueos y horario del día.
- **Demo siempre al día:** cuando cambia el día, la semilla se regenera (para que «hoy» siempre tenga citas) y se conservan las reservas hechas por personas en la demo, sus clientes y tarjetas de lealtad.
- **Lógica pura y probada** en `src/admin/overview.ts` (`computeOverview`, `timelineBounds`): totales, citas en curso y siguiente, ocupación (minutos reservados entre minutos de trabajo, descontando bloqueos sin contarlos dos veces), valor del día (sin cancelaciones ni no-shows) y avisos: _sin cerrar_ (ya terminó y nadie la marcó), _por confirmar_ (sin confirmar en las próximas 2 h), no-shows, bloqueos y cancelaciones.
- **Pantalla:** indicadores arriba (el valor en dinero solo para dueño y gerente), línea de tiempo por barbero a todo lo ancho desde 1280 px (listas por barbero debajo de ese ancho), próximas citas y avisos. Se actualiza cada minuto. El barbero ve solo su día.

### Agenda (`/admin/agenda`)

- **Vistas:** día (una columna por barbero) y semana (una columna por día para un barbero). El estado vive en la URL (`?fecha`, `?vista`, `?barbero`, `?cita`), así los avisos de la vista general abren la cita directamente. Debajo de 1024 px la cuadrícula se vuelve lista.
- **Acciones del personal** (`AdminRepository`; en mock, métodos `admin*` de `MockBookingRepository`, con las mismas reglas que aplicará el backend):
  - confirmar; completar solo cuando la cita ya empezó (si algún servicio es elegible, suma un sello; al llegar a la meta el corte gratis vence en `rewardValidityDays`); no-show solo después de la tolerancia; cancelar con confirmación;
  - crear citas desde el panel sin la anticipación mínima de 1 h de los clientes (hasta 90 días), y walk-ins «ahora» con el barbero libre que trabaje a esa hora; nunca dos citas a la vez para el mismo barbero;
  - reprogramar (fecha, hora y barbero), notas, bloqueos (no se pueden poner encima de citas pendientes) y búsqueda de clientes.
- **Permisos:** recepción, gerente y dueño hacen todo; el barbero ve solo su columna y puede confirmar, completar y marcar no-show.
- **Origen de la cita** (`Appointment.source`): en línea, panel o walk-in.
- **Datos de demostración (versión 2):** incluyen la semana anterior ya atendida (con algunos no-shows). Al subir `MOCK_DB_VERSION`, las demos guardadas se regeneran conservando las reservas reales.

### Tiempo real, avisos y controles del panel

- **Actualización en vivo:** `AdminRepository.subscribe(listener)` avisa de cada cambio en citas y bloqueos; el panel invalida sus consultas (`['admin', …]`) y la agenda y la vista general se actualizan sin recargar. En mock, `MockBookingRepository.onChange` escucha las escrituras de la pestaña y las de otras pestañas del mismo navegador (evento `storage`). Con Supabase será un canal de Realtime sobre `appointments` y `time_blocks`. Las consultas conservan `refetchInterval` de 60 s como respaldo.
- **Avisos de citas nuevas** (`src/admin/realtime/Notifications.tsx`): cada reserva en línea muestra una tarjeta flotante en cualquier pantalla del panel (con «Ver cita»), se agrega a la campana con contador de no leídos y, si la persona lo permite, aparece como aviso del navegador cuando el panel está en segundo plano. El barbero solo recibe las suyas. En la demo, la campana ofrece «Simular reserva en línea». Avisos con el panel cerrado (Web Push con service worker y llaves VAPID) requieren backend: hito 1C.
- **Menú lateral colapsable:** botón en la barra superior o tecla `[`; colapsado queda una columna de iconos con su nombre en tooltip (y para lectores de pantalla). La preferencia se guarda en este navegador.
- **Controles con el estilo de la plataforma:** `Select` (Radix Select) y `DatePicker` (Radix Popover con calendario propio: semana de lunes a domingo, hoy marcado, flechas, Re Pág/Av Pág, Inicio/Fin) sustituyen los controles del sistema. `Tip` (Radix Tooltip) muestra el detalle de cada cita al pasar el cursor o enfocar con teclado, en la agenda y en la línea de tiempo de la vista general.

### Agendar cita desde cualquier pantalla

- Botón **«Agendar cita»** en la barra superior (tecla `N`), para dueño, gerente y recepción. Abre un único panel (`NewAppointmentProvider`) que también usan la agenda (clic en un hueco, walk-in).
- Orden pensado para llamadas y WhatsApp: **1. Cuándo y con quién** (calendario, barberos como botones con foto, horarios libres como botones por mañana/tarde/noche), **2. Servicios**, **3. Cliente**. Los horarios aparecen antes de elegir servicios (con el servicio más corto) y, si al agregar servicios la hora elegida ya no cabe, el panel lo avisa y la libera. El pie resume fecha, hora, barbero, duración y total.

### Clientes (`/admin/clientes`)

- **Lógica pura** en `src/admin/customers/model.ts`: resumen por cliente (visitas completadas, no-shows y los de los últimos 90 días, cancelaciones, última visita, próxima cita, total gastado, tarjeta de sellos), filtros y búsqueda (nombre o correo sin acentos; teléfono por dígitos). Con Supabase, el mismo resumen puede salir de una vista.
- **Lista:** indicadores (clientes, nuevos del mes, con cita próxima, cortes gratis por canjear), búsqueda, filtros (con cita, frecuentes con 3+ visitas, con no-shows, corte gratis) y tabla ordenable. La ficha se abre en un panel lateral con `?cliente=id`.
- **Ficha:** agendar cita con el cliente ya elegido, llamar y WhatsApp; aviso de 3 no-shows en 90 días (la reserva en línea le pide contactar a la barbería); sellos; próximas citas e historial (abren la cita en la agenda); datos y notas editables (teléfono y correo únicos). El total gastado solo lo ven dueño y gerente. El barbero no entra a Clientes.
- **Datos de demostración (versión 3):** clientes frecuentes con varias visitas, tarjetas de sellos variadas (una con corte gratis listo) y algunas notas; nadie repite día y cada frecuente tiene como máximo una cita pendiente.

### Servicios y precios (`/admin/catalogo`)

- **El catálogo es dato del negocio:** en la demo se guarda con el resto (`keepCatalog`) y ya no se regenera desde la semilla al recargar, al cambiar de día ni de versión; solo las fotos de los barberos vienen de la semilla (sus URLs cambian por compilación).
- **Reglas** (métodos `admin*` de `MockBookingRepository`, con pruebas): nombre obligatorio y sin repetir (sin importar acentos ni mayúsculas); duración de 15 min a 4 h en pasos de 15; precio en pesos enteros, **único con cualquier barbero**; un servicio visible necesita al menos un barbero; un servicio con citas no se borra (se oculta); una categoría solo se borra vacía. Cambiar precio o duración no modifica citas ya agendadas.
- **Quién lo realiza:** se guarda en `Staff.serviceIds`; un barbero con `'all'` pasa a lista explícita cuando se le quita un servicio. La disponibilidad del sitio y del panel lo respeta.
- **Pantalla:** servicios por categoría en el orden del sitio, búsqueda y filtro visibles/ocultos; subir/bajar servicios y categorías; panel lateral con vista previa de la tarjeta pública (`ServiceCard`). Dueño y gerente editan; recepción solo consulta.
- **Sitio público:** los cambios se ven al momento (se invalidan `catalog`, `staff` y `slots`). Si un servicio destacado en la portada se oculta, la portada lo omite.
