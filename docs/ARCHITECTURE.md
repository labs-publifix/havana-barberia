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

## Color de acento (pruebas de color)

- El acento se llama `accent-*` en todas partes: variables CSS (`--color-accent-100…800`), clases de Tailwind (`bg-accent-500`, `text-accent-700`…), tokens semánticos y documentación.
- **Sus valores viven solo en `src/styles/accent.css`.** Ahí también están el rol de texto de acento sobre claro, la superficie seleccionada sobre oscuro, el brillo (`--shadow-glow`) y la escala de advertencia, porque esta cambia junto con el acento.
- **Respaldo aqua:** `src/styles/accent.aqua.css`. Para revertir en un paso, en `src/styles/tokens.css` importa `./accent.aqua.css` en lugar de `./accent.css`.
- `npm run contrast` calcula el contraste WCAG de cada combinación con los valores reales y escribe `docs/design/contrast-accent.md`. Para revisar otro tema: `node scripts/check-contrast.mjs src/styles/accent.aqua.css`. CI lo corre antes del build.
- `e2e/accent-rules.spec.ts` recorre las pantallas renderizadas y falla si hay texto blanco sobre el acento, accent-500 como texto sobre fondo claro o colores de la paleta anterior.

### Mostrar una rama de prueba en la vista previa

GitHub Pages tiene un solo sitio por repositorio. El workflow **Deploy to GitHub Pages** se puede lanzar a mano desde cualquier rama:

1. GitHub → **Actions** → **Deploy to GitHub Pages** → **Run workflow**.
2. En «Use workflow from», elige la rama (p. ej. `feat/accent-gold-test`) y confirma.

Ese despliegue reemplaza lo publicado. Para volver a la versión de `main`, lanza el mismo workflow eligiendo `main` (o haz cualquier push a `main`).
