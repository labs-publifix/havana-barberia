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
