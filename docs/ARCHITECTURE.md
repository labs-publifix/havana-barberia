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

## Base de datos (Supabase, hito 1C)

**Hecho:** esquema, permisos y candados en `supabase/migrations/`, datos iniciales en `supabase/seed.sql`.

- **Tablas:** `settings` (políticas, finanzas y horario en una sola fila), catálogo (`categories`, `services`, `products` y `product_costs` aparte), equipo (`staff` con horario en JSON, `staff_services`, `commission_versions` con vigencias), `customers`, `loyalty_cards`, `appointments` (con `service_ids`), `payments` (ticket completo: pago mixto, productos, descuento y corte gratis), `time_blocks`, `product_sales`, `cash_moves`, `daily_closes`, `advances`, `bonus_rules`, `bonus_awards`, `payroll_closes`, `payroll_payments`, `profiles` (usuarios del panel) y `audit_log`.
- **Reglas en la base** (no se pueden saltar desde la pantalla): sin citas encimadas por barbero (restricción de exclusión; canceladas y no-shows liberan el horario), valores permitidos de las políticas, caja cerrada sin movimientos, semana de nómina cerrada sin anticipos, bonos ni comisiones nuevas dentro de ella, nadie cambia su propio rol y siempre queda una persona dueña activa.
- **Permisos (RLS):** dueño y gerente todo, incluidas finanzas; recepción agenda, clientes, ventas y caja (lee catálogo y equipo, no ve comisiones ni costos); barbero solo sus citas, sus clientes, su comisión y sus pagos. El sitio público (`anon`) lee catálogo, equipo y políticas, y usa funciones seguras: `busy_times` (horarios ocupados sin datos del cliente), `appointment_by_token` y `loyalty_by_token` (con el enlace privado).
- **Bitácora:** cobros, ventas, caja, nómina, comisiones, costos, usuarios y ajustes quedan en `audit_log` con quién y cuándo.
- **Pruebas:** `scripts/test-db.sh` levanta un Postgres local, aplica migraciones y semilla, y corre `supabase/tests/*.test.sql` (quién ve y cambia qué).
- **Despliegue:** `.github/workflows/supabase.yml` corre esas pruebas en cada PR y, desde `main`, aplica las migraciones al proyecto con los secretos `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` y `SUPABASE_PROJECT_REF`; `RESEND_API_KEY` se guarda como secreto de las Edge Functions.

**Entrega 1 (conectado):** `VITE_DATA_SOURCE=supabase` usa `SupabaseBookingRepository` (catálogo, equipo y políticas; la reserva en línea muestra «abre muy pronto» hasta la entrega 3) y `SupabaseAdminRepository` (sesión con correo y contraseña, usuarios, catálogo y productos, equipo con vigencias de comisión y ausencias, ajustes y finanzas). Las secciones aún no conectadas lo dicen (`AdminRepository.available`).

- **Acceso:** Supabase Auth sin registro público. La primera persona del sistema queda como dueña (migración `first_owner`); se invita desde Supabase › Authentication › Users › Invite user. Las demás las invita la dueña desde Ajustes › Usuarios (Edge Function `invite-user`, que crea el perfil con su rol). El enlace del correo lleva a `/admin/contrasena`. **Decisión de la barbería:** todos los roles entran solo con correo y contraseña (sin verificación en dos pasos, para que sea fácil para el equipo); el código para activarla con QR se conserva por si se decide usarla después (`mfaRequired`).
- **Publicación:** GitHub Pages con dominio propio `havanabarberia.com` (registros A de GitHub en Namecheap, `www` redirige; dominio verificado en la cuenta). El sistema real vive en la raíz: sitio, reserva y `/admin` (variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`). La demo con datos de ejemplo vive en `/demo/`. `404.html` es la app real, así que los enlaces profundos abren directo; `scripts/pages-404.mjs` manda los de `/demo/` a su build, conservando el `#hash` donde viajan los tokens de los correos.
- **Correos:** remitente `EMAIL_FROM` y copia oculta a `EMAIL_BCC` (variables de GitHub) para los correos de la barbería; los de acceso los envía Supabase Auth por el SMTP de Resend.

**Entrega 2 (conectado):** todo el panel lee y escribe en Supabase: agenda (citas, sin cita, reprogramar, no-show), clientes y lealtad, cobro, ventas de mostrador, caja del día, anticipos, bonos, cierre semanal y reportes. Las citas, cobros y bloqueos llegan en tiempo real (Supabase Realtime) a todas las pantallas abiertas.

- **Lo que no se deja al navegador** (migración `charging`, funciones `security definer` con validación de rol):
  - `complete_appointment`: cobra a precios del catálogo, aplica corte gratis (en un combo descuenta el precio de un corte y cobra la diferencia), descuento, productos con su comisión, pago mixto que debe sumar, y sello o canje de la tarjeta.
  - `close_day`: el efectivo esperado se calcula en la base (fondo + efectivo cobrado, mixtos repartidos, ventas, entradas − salidas).
  - `record_sale`: venta de mostrador al precio y comisión del catálogo.
- **Descuentos:** dueño y gerente descuentan directo. Si cobra otra persona, el dueño o gerente escribe su correo y contraseña en esa pantalla; la Edge Function `authorize-discount` los verifica en el servidor y deja una autorización de un solo uso, por ese monto, válida 10 minutos (tabla `discount_approvals`, sin acceso desde el navegador). El cobro guarda quién autorizó.
- **Pruebas:** `supabase/tests/charging.test.sql` cubre cobro, descuento autorizado, pago mixto, corte gratis en combo, corte de caja y venta.

**Entrega 4 (conectado):** correos y fotos.

- **Correos** (migración `emails_storage`, Edge Function `send-emails`):
  - **Bandeja `email_outbox`:** triggers en `appointments` encolan la confirmación, el aviso de cambio de horario y el de cancelación. Las citas en línea también avisan al barbero. Los clientes sin cita no reciben correo.
  - **Recordatorios:** `app.queue_reminders()` encola el de un día antes (si se agendó con más de un día) y el de dos horas antes. Cada uno sale una sola vez por cita y horario.
  - **Envío:** `pg_cron` corre `app.mailer_tick()` cada minuto. Si hay pendientes, llama a `send-emails` vía `pg_net` con una llave compartida que el despliegue renueva cada vez (`app.mailer_config`, fuera del API). La función arma el correo (`supabase/functions/_shared/emails.ts`, probado con Vitest) y lo manda por Resend desde `EMAIL_FROM`, con copia oculta a `EMAIL_BCC`. Reintenta hasta 3 veces.
  - **Modo prueba:** Ajustes › Correos (`settings.customer_emails`, apagado por omisión). Mientras esté apagado, todo llega solo a la copia de revisión con «[Prueba · para …]» en el asunto, para no duplicar los correos de AgendaPro. La misma pestaña muestra los últimos 30 envíos.
  - **Enlaces:** apuntan a `SITE_URL` (variable opcional de GitHub). El enlace para cambiar o cancelar aparece cuando `VITE_BOOKING_OPEN=true`; antes, el correo da el teléfono.
- **Diseño de los correos:** marca en oscuro (tokens v2: negro, tipografía blanca, Geist con respaldo del sistema, aqua solo en el botón principal) y logo en PNG (`public/email/logo-white.png`, porque varios clientes de correo no muestran WebP). Los correos de acceso de Supabase (invitación y recuperación) usan el mismo marco: `supabase/templates/invite.html` y `recovery.html` se pegan en Supabase › Authentication › Emails, y una prueba revisa que sigan iguales al código.
- **Enlaces de acceso:** cualquier enlace de invitación o recuperación, incluido uno vencido, lleva a `/admin/contrasena` (`src/main.tsx`), aunque Supabase lo mande a la raíz del sitio. Si venció, esa pantalla pide un enlace nuevo.
- **Usuarios con contraseña temporal:** en Ajustes › Usuarios, la dueña puede crear la cuenta ya confirmada con una contraseña temporal (sin correo) en lugar de mandar invitación (`invite-user` con `createUser` y `email_confirm`).
- **Fotos:** el bucket público `photos` de Storage (máx. 2 MB; WebP, JPEG o PNG). Solo el dueño y el gerente suben; `uploadProductImage` y `uploadStaffPhoto` guardan en `products/` y `staff/` y devuelven la URL pública.
- **Pruebas:** `supabase/tests/emails.test.sql` (bandeja, recordatorios, permisos y fotos) y `src/test/emails.test.ts` (textos).

**Ajustes previos al lanzamiento:**

- **Rol Desarrollador:** tiene el mismo acceso que el dueño, incluidos usuarios y bitácora (`app.is_owner()`, `isOwnerRole`/`isFinanceRole` en el panel). Sirve para revisar cada módulo con una cuenta real. Siempre debe quedar al menos un dueño activo.
- **Barberos desde el panel:** el dueño los da de alta en Equipo con nombre, título, descripción para el sitio, foto y un correo para avisos de citas (`staff_contacts`, privado; solo dueño, desarrollador y gerente). El aviso al barbero va a ese correo y, si no hay, al de su usuario. La semilla ya no crea barberos, para que un despliegue no regrese a alguien dado de baja; las pruebas usan `supabase/tests/fixtures.sql`.
- **Horario de la barbería en un solo lugar (Ajustes › Horario):** se guarda en `settings.business_hours` y todo lo lee de ahí:
  - el sitio (`useBusinessHours()`): horario, «Abierto ahora / abre mañana», pie de página, datos para Google y días de la reserva;
  - la reserva en línea, en el navegador y en el servidor;
  - el panel: agenda, reportes y límites de los turnos.

  Cada barbero trabaja dentro de ese marco: una hora se puede reservar solo si la barbería está abierta y el barbero tiene turno. Al guardar, el panel avisa qué barberos quedaron con turnos fuera y qué citas próximas caen fuera. `config/business` solo es el valor de respaldo mientras carga.

- **Eliminar barberos** (Equipo › barbero › «Eliminar barbero», función `delete_staff`):
  - **sin historial** (sin citas, ventas, anticipos, pagos de nómina ni usuario del panel): se borra por completo, junto con su horario, servicios, comisiones, ausencias y correo;
  - **con historial:** se archiva (`archived_at`). Desaparece de Equipo, del sitio y de la reserva, su acceso al panel termina, y los reportes y la nómina pasados siguen cuadrando;
  - **con citas próximas:** primero hay que moverlas o cancelarlas.
- **El sitio muestra solo a los activos:** las pills del hero, la sección de equipo y la reserva salen de `listStaff()` (solo activos, en el orden de Equipo). La foto subida en el panel tiene prioridad; si no hay foto, se ven las iniciales.

**Entrega 3 (conectado):** reserva en línea.

- **Horarios:** el navegador calcula los horarios libres con el mismo motor de siempre (`src/lib/availability`). Lee las citas y los bloqueos del día con `busy_slots`, que solo devuelve horarios, nunca datos de clientes.
- **Reservar, cancelar y reprogramar:** pasan por la Edge Function `booking`.
  - Reservar exige Cloudflare Turnstile: es una revisión invisible que solo muestra una casilla si Cloudflare la necesita (`src/lib/turnstile.ts`, sin cambiar las pantallas del flujo).
  - Cancelar y reprogramar usan el token privado del enlace del cliente.
  - Hay límites por IP (`rate_limit`): 6 reservas por hora y 20 cambios por hora.
- **El servidor revisa con las mismas reglas que el sitio:** `supabase/functions/_shared/engine.js` es el motor de `src/lib` empaquetado para Deno (`npm run engine`; una prueba avisa si quedó desactualizado) y `_shared/booking.ts` decide (probado con Vitest).
- **Reglas del servidor:**
  - mismo teléfono o correo es el mismo cliente;
  - máximo de citas activas;
  - con 3 no-shows en 90 días se pide contactar a la barbería;
  - cambios hasta `change_cutoff_min` antes;
  - la restricción de exclusión evita dobles citas aunque dos personas reserven a la vez.
- **Encendido:** la variable `VITE_BOOKING_OPEN=true` de GitHub abre `/reservar`, `/cita/:token`, `/confirmacion/:token` y `/lealtad/:token` en el sistema real, y agrega a los correos el enlace para cambiar o cancelar. Llaves: `VITE_TURNSTILE_SITE_KEY` (pública) y `TURNSTILE_SECRET_KEY` (secreto de la función).

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
- **Roles** (`domain.ts`): dueño y gerente ven todo (finanzas incluidas); recepción opera agenda, clientes, ventas, catálogo y equipo; el barbero solo ve su vista general, su agenda y sus comisiones.
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

### Productos (`/admin/catalogo?vista=productos`)

- **Modelo** (`Product` en `src/domain/types.ts`): nombre, marca opcional, precio público, costo, comisión fija para el barbero (pesos enteros), foto y disponibilidad. Costo y comisión pueden quedar vacíos (`null`, «Sin capturar») hasta que el dueño los capture. Los productos de demostración son genéricos y **sin costo ni comisión**: las cifras reales solo viven en la base de datos, nunca en este repositorio público.
- **Permisos:** costo, comisión y margen solo los ven dueño y gerente (no se muestran ni se envían en la interfaz de recepción); recepción consulta nombre, foto y precio. El barbero no entra al catálogo.
- **Margen** (`src/admin/catalog/products.ts`, con pruebas): precio − costo − comisión, en pesos y porcentaje; marca «estimado» si falta un dato y avisa si se vende por debajo del costo.
- **Fotos:** `ImageUploader` valida (JPG, PNG o WebP hasta 10 MB), reduce en el navegador a 800 px (WebP, o JPEG si el navegador no codifica WebP) y llama a `AdminRepository.uploadProductImage`. En la demo la foto se guarda como data URL dentro de los datos del navegador (el almacenamiento local tiene ~5 MB: suficiente para probar, no para todo el inventario). Con Supabase: un bucket de Storage y su URL pública.

### Citas confirmadas y cobro al completar

- **Reservas en línea confirmadas:** `createAppointment` y la reprogramación desde el enlace del cliente guardan la cita como `confirmed`; la barbería no confirma a mano. El estado `booked` («Sin confirmar») se conserva en el modelo para datos importados.
- **Completar = cobrar:** `AdminRepository.completeAppointment(id, { method, tip, tipMethod })` exige el método de pago (efectivo, tarjeta o transferencia) y registra la propina y cómo se pagó (la propina con tarjeta lleva la comisión de la terminal). Se guarda en `Appointment.payment` (`amount` = precio de la cita, `paidAt`). Completar sigue sumando el sello de lealtad.
- **Corte de caja:** `cashSummary` (`src/admin/cash.ts`, con pruebas) suma por método los servicios y las propinas: lo que debe haber en caja, terminal y banco. La vista general muestra «Caja de hoy» a dueño, gerente y recepción (el valor esperado del día solo a dueño y gerente); el barbero ve sus propinas del día. Las ventas de productos se sumarán en la fase de finanzas.
- **Datos de demostración (versión 5):** citas futuras confirmadas y citas atendidas con pago (mezcla de métodos y propinas ocasionales).

### Equipo y horarios (`/admin/equipo`)

- **Modelo:** `Staff` (nombre, título opcional, foto, activo, `schedule` semanal con uno o más turnos por día, `serviceIds`) y `StaffCommission` (`mode` `percent` | `fixed`, `value` general y `overrides` por servicio). La demo crea las comisiones **vacías** («Sin capturar»): las cifras reales viven solo en la base de datos, nunca en este repositorio público.
- **Reglas** (`adminSaveStaff`, con pruebas): nombre sin repetir; turnos cada 15 min, dentro del horario de la barbería y sin encimarse (`scheduleErrors` en `src/lib/schedule.ts`); un barbero activo da al menos un servicio; porcentaje 0–100 y montos en pesos enteros. Al guardar devuelve las citas futuras que quedan fuera del nuevo horario o servicios (o todas si se desactiva) para reasignarlas desde la Agenda; no se mueven solas.
- **Comisión** (`commissionOn` en `src/admin/team/model.ts`): monto propio del servicio si existe, si no la general; el panel muestra lo que gana por cada servicio. Solo dueño y gerente la ven.
- **Ausencias:** bloques de días completos por barbero (`createBlock`); la agenda los recorta por día y la disponibilidad pública los respeta. Recepción consulta el equipo y puede registrar ausencias.
- **Sitio público:** un barbero inactivo deja de aparecer en la portada y en la reserva; el orden del equipo es el del sitio.

### Ajustes (`/admin/ajustes`)

- **Políticas guardadas:** `MockDb.policy` (valores iniciales en `src/config/business.ts`). `MockBookingRepository` las aplica en disponibilidad, límite de citas, plazo de cambios, tolerancia y lealtad; el sitio público las lee con `usePolicy()` (`BookingRepository.getPolicy`), con los valores de `config/business` mientras cargan. Supabase: una fila de `settings`.
- **Valores permitidos** (`src/lib/policy.ts`, con pruebas): cada regla toma un valor de una lista corta para que los textos públicos se lean bien («hasta 4 horas antes»); la cuadrícula de 15 min es fija. `policySummary` arma la vista previa «Así lo lee el cliente».
- **Lealtad:** meta de sellos, vigencia y servicios que suman sello (`Service.loyaltyEligible`). Al cambiar la meta, las tarjetas en curso se ajustan; si baja, quien ya la alcanza gana su corte desde hoy; los premios ya ganados se respetan.
- **Usuarios** (`AdminRepository.saveUser`, con pruebas): solo la persona dueña invita, cambia rol o quita acceso; correo único; un barbero se liga a un perfil de Equipo sin usuario; nadie cambia su propio rol ni se quita el acceso; siempre queda una persona dueña activa. Todos entran con correo y contraseña. En la demo los usuarios se guardan en este navegador (`havana:admin-users`) y entran con la contraseña de demostración; con Supabase, invitación por correo (`auth.admin.inviteUserByEmail`).
- **Permisos:** dueño y gerente editan las políticas; el gerente consulta los usuarios. La matriz «Qué ve cada rol» se arma con las mismas reglas de navegación (`sections.ts`).

### Finanzas (adelanto de la fase 2)

- **Cálculo puro** en `src/admin/finance.ts` (con pruebas): semanas de lunes a domingo, ganancias por barbero (comisión por servicio según su regla de Equipo, comisión de productos vendidos, propinas, anticipos y lo que se le paga) y ventas por día.
- **Datos** (`AdminRepository.getFinance(from, to)`): citas del periodo, servicios, equipo, reglas de comisión, anticipos (`MockDb.advances`) y ventas de productos (`MockDb.sales`). Un barbero solo recibe lo suyo (con Supabase lo hace RLS).
- **Pantallas:** Ventas (desk; registrar venta con precios del catálogo), Comisiones (barbero: «Mis comisiones»), Cierre y nómina y Reportes (dueño y gerente). Las comisiones de la demo están vacías: aparecen como «sin capturar» hasta que se capturan en Equipo o en el producto. Los cálculos se validan con la barbería antes de usarse para pagar.
- **Datos de demostración (versión 7):** cuatro semanas de citas atendidas con pago.
- **Ajustes › Finanzas** (`FinanceSettings` en `MockDb.finance`): día de inicio de la semana de nómina (lunes por omisión; todas las pantallas de finanzas la usan vía `useFinanceWeek`), comisión de la terminal (la absorbe la barbería: se muestra como costo en el cierre; las propinas llegan completas) y bonos de monto fijo. Los bonos «manuales» (puntualidad, asistencia) se marcan por barbero y semana (`MockDb.bonusAwards`); los de meta (servicios, productos) se ganan solos al llegar a la meta. Montos vacíos hasta que la barbería los captura.
- **Corte gratis** (`src/lib/loyalty.ts`): al completar, si la tarjeta está llena y vigente, se puede usar en el corte de la cita (categoría Cortes; el más caro si hay varios). No se cobra, no paga comisión (`payment.rewardServiceId`), la tarjeta vuelve a cero y esa visita no suma sello.
- **Ticket** (`src/admin/ticket.ts`): PDF de 80 mm (rollo térmico estándar) con jsPDF, cargado solo al generarlo. Desde «Completar y cobrar» (opción de imprimir al completar, recordada en el equipo), desde la cita cobrada y desde Ventas. No es comprobante fiscal.
- **Ticket completo** (`MockBookingRepository.buildPayment`): servicios menos corte gratis (en un combo descuenta el precio de un corte y se cobra la diferencia; `rewardAmount`) y descuento autorizado (`payment.discount` con quién autorizó; `MockAdminRepository` valida al dueño/gerente con sesión o con su correo y contraseña), productos del mismo ticket (`payment.products`, comisión al barbero de la cita) y pago mixto (`payment.splits`, debe sumar el cobro sin propina). `cashSummary` reparte los pagos mixtos por forma de pago. Ajustes › Finanzas decide si la comisión con descuento va sobre precio de lista (por omisión) o sobre lo cobrado.
- **Caja del día** (Ventas › Caja del día): fondo inicial, cobros y propinas en efectivo, entradas y salidas (`MockDb.cashMoves`) y arqueo (`MockDb.dailyCloses`; el esperado lo calcula el repositorio). Un día cerrado no acepta cambios; dueño o gerente lo reabren.
- **Cierre de semana** (`MockDb.payrollCloses`): congela los recibos calculados por el repositorio; Comisiones y Cierre muestran esas cifras; bloquea anticipos y bonos de esa semana; cada recibo se marca pagado. Solo el dueño reabre.
- **Vigencias de comisión** (`MockDb.commissionHistory`): al cambiar la comisión se elige desde cuándo aplica (esta semana, hoy o la próxima); el primer cambio guarda la regla anterior como base. `earnings` usa la regla vigente en la fecha de cada cita. No se permite una fecha dentro de una semana cerrada.
- **Reportes:** cada indicador se compara con el mismo tramo del periodo anterior (`periodStats`, `comparison`); «Exportar a Excel» descarga los tickets del periodo en CSV con BOM (`src/lib/csv.ts`).
