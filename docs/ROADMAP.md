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
| Hito 1B · Panel administrativo (UI con datos de prueba)          | 🔨 En curso: entregas 1 a 8 listas para revisión |
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
6. ✅ **Equipo y horarios:** barberos, horario semanal por turnos (comida entre turnos), servicios que da cada uno
   (un interruptor por servicio), comisión individual (porcentaje o monto fijo, con monto propio por servicio) y ausencias.
   Los festivos de toda la barbería se bloquean desde la Agenda.
7. ✅ **Ajustes:** políticas de reserva (anticipación, días hacia adelante, citas por cliente, tiempo entre citas,
   plazo para cambios, tolerancia) y de lealtad (sellos, vigencia, servicios que suman sello), con vista previa de lo
   que lee el cliente; usuarios (invitar, rol, perfil de barbero, quitar acceso) y matriz de qué ve cada rol.
8. ✅ **Administración (UI con datos de prueba):** Ventas (tickets de la semana, venta de productos en
   mostrador, ticket en PDF), Comisiones (por barbero y semana, con detalle por cita), Cierre y nómina (entradas por
   forma de pago, comisión de terminal, bonos, anticipos y recibo por barbero) y Reportes (ventas por día,
   desempeño, servicios y canales). Ajustes › Finanzas: semana de nómina, comisión de terminal y bonos.

   **Decisiones de la barbería (ya aplicadas):** comisión personal por barbero; combos con el porcentaje del barbero
   sobre el precio del combo (o monto propio); bonos de monto fijo configurables (puntualidad y asistencia se marcan
   cada semana; meta de servicios y venta de productos se calculan solos); semana de nómina de lunes a domingo,
   configurable; el corte gratis no se cobra ni paga comisión; la comisión de la terminal la absorbe la barbería;
   ticket de 80 mm en PDF al completar y cobrar.

   **Completado antes del backend:** ticket completo al cobrar (servicios y productos, corte gratis también en combos
   cobrando la diferencia, descuentos con autorización del dueño o gerente, pago mixto), caja del día (fondo,
   entradas y salidas, arqueo y cierre), cierre de la semana de nómina (recibos congelados y marcados como pagados),
   vigencias de comisión y comparativos con exportación a Excel (CSV) en Reportes.

   **Para el backend (hito 1C):** guardar todo en Supabase con permisos por rol, bitácora de cambios, y la
   autorización de descuentos con reautenticación real.

Permisos que la UI debe reflejar: el barbero solo ve su agenda y sus comisiones;
finanzas solo dueño y gerente; recepción opera agenda, clientes y ventas.

## Hito 1C · Backend

- Esquema en Supabase (Postgres + RLS) según el modelo de datos, restricción de
  exclusión contra dobles citas, `audit_log`, `settings`.
- Auth real: sin registro público, invitaciones, roles; entrada con correo y contraseña para todos los
  roles (la barbería decidió no usar verificación en dos pasos; se puede activar después).
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

Dominio `havanabarberia.com` (sitio, reservas y panel en `/admin`; `www` redirige al dominio;
quitar la base `/havana-barberia/`), migración de
clientes y sellos desde AgendaPro, aviso de privacidad, periodo en paralelo, cambio del
enlace en Google y apagado de AgendaPro.

## Ya disponible para finanzas

- Cada cita completada guarda su pago (método, monto, propina y cómo se pagó la propina) y la vista general muestra la caja del día. La fase 2 lo usará para el cierre diario/semanal, la comisión de terminal sobre propinas y las comisiones por barbero.

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
- Decisiones de finanzas: resueltas (ver entrega 8). Falta capturar montos reales de comisiones, bonos y
  comisión de terminal directamente en el sistema (nunca en este repositorio).
- Lealtad: servicios que dan sello y vigencia del corte gratis (propuesta 90 días).
- Logo en SVG, horario de domingo, número de WhatsApp.
