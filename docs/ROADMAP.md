# Roadmap · Havana Barbería

Construimos de afuera hacia adentro: primero la interfaz con datos de prueba (mock),
aprobada por el cliente; después la conexión a Supabase y Resend sin cambiar pantallas.

> Repositorio público: aquí solo va el alcance. Montos de comisiones, tarifas, nómina
> y datos de clientes viven únicamente en la base de datos, nunca en el código.

## Decisiones vigentes

- **Supabase en plan gratuito** (proyecto chico). Mitigaciones: tarea diaria que evita
  la pausa por inactividad y respaldo semanal cifrado fuera del repositorio (por definir
  antes del lanzamiento).
- **Resend** para correos transaccionales y como SMTP de Supabase Auth (requiere el
  dominio verificado).
- **Panel administrativo de escritorio primero**: se usa sobre todo en una pantalla grande
  de la barbería. Debe ser responsive (tableta y celular para consultas rápidas, p. ej.
  un barbero viendo su agenda), pero el diseño se optimiza para pantallas amplias.
- **Mismos tokens de diseño v2**, adaptados a una herramienta de trabajo de consulta muy
  frecuente: alta densidad legible, jerarquía sobria, el aqua solo para estado y acción
  principal, cifras tabulares, navegación por teclado.

## Estado

| Etapa                                                            | Estado                                           |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| Hito 1A · Sitio público y flujo de reserva (mock)                | ✅ Aprobado por el cliente                       |
| Rediseño del sitio público                                       | ✅ Aprobado y publicado                          |
| Hito 1B · Panel administrativo (UI con datos de prueba)          | 🔨 En curso: entregas 1 a 5 listas para revisión |
| Hito 1C · Backend: Supabase + conexión del panel y de la reserva | Pendiente                                        |
| Hito 1D · Lanzamiento (dominio, migración de AgendaPro, Google)  | Pendiente                                        |
| Fase 3 · Crecimiento                                             | Pendiente                                        |

## Hito 1B · Panel administrativo con datos de prueba (`/admin`)

Mismo patrón que la reserva: las pantallas hablan con un repositorio (`AdminRepository`)
que hoy es mock y mañana Supabase. Los datos de prueba siguen el modelo de datos de los
fundamentos para que lo aprobado ya tenga la forma final. Inicio de sesión y roles
**simulados** (selector de demostración por rol); la seguridad real llega en el hito 1C.
Solo datos inventados y genéricos.

Entregas, cada una publicada en la vista previa para revisión:

1. ✅ **Base del panel:** inicio de sesión (con paso de verificación en dos pasos, visual),
   estructura de navegación, selector de rol de demostración y componentes de trabajo
   (tablas, filtros, formularios, paneles laterales).
2. ✅ **Vista general:** citas de hoy, siguiente cita, ocupación por barbero, alertas.
3. ✅ **Agenda:** día y semana por barbero; detalle de cita; completar (otorga sello),
   no-show, cancelar, reprogramar; crear cita o walk-in; bloquear horario.
4. ✅ **Clientes:** búsqueda, ficha con historial, no-shows y sellos.
5. ✅ **Catálogo** (incluye **productos** con foto, costo, precio y comisión): servicios, categorías, duración, precio, orden, activo y qué barbero
   realiza cada servicio.
6. **Equipo y horarios:** barberos, horario semanal, vacaciones, comidas, festivos.
7. **Ajustes:** políticas de reserva y de lealtad, usuarios y roles.
8. **Adelanto de administración (fase 2, solo UI):** a petición del cliente se adelanta
   la parte visual con datos ficticios:
   - **Ventas:** registro manual de ticket (servicios, productos, pagos mixtos, propinas,
     descuentos con autorización); una cita completada puede generar su venta.
   - **Comisiones y bonos:** reglas editables por servicio y barbero con vigencias
     (cambiar una regla crea una vigencia nueva, el historial no se reescribe).
   - **Cierre semanal y nómina:** resumen por forma de pago y salidas, anticipos,
     recibo semanal por barbero.
   - **Reportes** básicos.

   Los cálculos reales se validan en la fase 2 con las decisiones pendientes
   (ver abajo).

Permisos que la UI debe reflejar: el barbero solo ve su agenda y sus comisiones;
finanzas solo dueño y gerente; recepción opera agenda, clientes y ventas.

## Hito 1C · Backend

- Esquema en Supabase (Postgres + RLS) según el modelo de datos, restricción de
  exclusión contra dobles citas, `audit_log`, `settings`.
- Auth real: sin registro público, invitaciones, roles, verificación en dos pasos para
  dueño y gerente.
- Migraciones aplicadas desde GitHub Actions con secretos del repositorio
  (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).
- `SupabaseAdminRepository` y `SupabaseBookingRepository`; reserva pública por Edge
  Function con Turnstile y límites.
- Tiempo real con Supabase Realtime (la UI ya usa `AdminRepository.subscribe`) y avisos
  push con el panel cerrado (Web Push: service worker + llaves VAPID; la llave privada
  vive solo en Supabase).
- Correos con Resend (confirmación, cancelación/reprogramación, aviso al equipo,
  recordatorios 24 h y 2 h con pg_cron).

## Hito 1D · Lanzamiento

Dominio `reservas.havanabarberia.com` (quitar la base `/havana-barberia/`), migración de
clientes y sellos desde AgendaPro, aviso de privacidad, periodo en paralelo, cambio del
enlace en Google y apagado de AgendaPro.

## Fase 2 · Administración (lógica real)

Ventas, comisiones y bonos, cierre semanal, anticipos, recibos de nómina y reportes
conectados a la base, sobre la UI aprobada en el hito 1B.

## Fase 3 · Crecimiento

Recordatorios por WhatsApp, lealtad ampliada (cumpleaños, referidos), pago en línea,
inventario.

## Pendientes del cliente

- Accesos: cambio de propiedad del dominio en Namecheap; verificación de Resend;
  secretos de Supabase en GitHub; Cloudflare Turnstile.
- Exportación de AgendaPro (clientes e historial).
- Decisiones para la fase 2: comisión de combos nuevos, tarifa por nivel o personal,
  bonos (ventas de producto, puntualidad, asistencia), día de inicio de la semana de
  nómina, quién absorbe la comisión de un corte gratis, precio único o por barbero (resuelto: precio único).
- Lealtad: servicios que dan sello y vigencia del corte gratis (propuesta 90 días).
- Logo en SVG, horario de domingo, número de WhatsApp.
