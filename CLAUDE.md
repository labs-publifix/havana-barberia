# Havana Barbería · Sistema de citas y administración

## Qué es
Sistema propio de reservas (público, móvil primero) y panel administrativo para Havana Barbería (una sola sucursal, Querétaro). Reemplaza a AgendaPro. Idioma de interfaz: es-MX, tuteando. Código y commits en inglés.

## Stack
- Frontend: Vite + React 18 + TypeScript (strict) + Tailwind CSS + React Router + TanStack Query + react-hook-form + zod + date-fns/date-fns-tz + lucide-react + Radix UI.
- Hosting: GitHub Pages (GitHub Actions). Sin servidor propio.
- Backend (hito 1B, aún no): Supabase (Postgres, Auth, RLS, Edge Functions, pg_cron) y Resend para correos.
- Pruebas: Vitest, Testing Library, Playwright.

## Comandos
- `npm run dev` · `npm run build` · `npm run preview`
- `npm run lint` · `npm run typecheck` · `npm run test`

## Reglas
- El repositorio es PÚBLICO: nunca subir secretos, llaves de servicio, datos de clientes, comisiones o nómina.
- La UI nunca accede a datos directamente: usa la interfaz `BookingRepository` (`src/data`). Mock hoy, Supabase mañana.
- La lógica de disponibilidad es pura y probada (`src/lib/availability`). Zona horaria America/Mexico_City.
- La base de la app sale de `VITE_BASE`; todas las rutas y recursos deben respetarla. El workflow copia `index.html` a `404.html`.
- Móvil primero: probar en 360 y 390 px; sin desplazamiento horizontal; zonas táctiles ≥ 44 px; campos ≥ 16 px.
- Accesibilidad: contraste AA, foco visible, teclado, `prefers-reduced-motion`.
- Logo: usar solo mediante `<Logo />` (hoy JPG; pendiente SVG).

## Diseño (tokens v2.1)
- Negro base `#0A0A0B`; acento único con nombre semántico **`accent-*`** (100/300/400/500/600/700/800). Sus valores viven **solo** en `src/styles/accent.css`: una prueba de color es un cambio en ese archivo. Respaldo de la paleta aqua original: `src/styles/accent.aqua.css` (para revertir, importarlo en `src/styles/tokens.css`).
- Prueba actual (rama `feat/accent-gold-test`): dorado, base `#D19C40`. Sobre negro: botón accent-500 con texto ink-950 (nunca blanco) y texto de acento accent-400. Sobre blanco: botón principal negro; accent-500 solo decorativo (líneas, íconos grandes, sellos), texto de acento accent-700. Seleccionado: fondo accent-100, borde accent-700, texto negro. «Confirmada»: accent-100 / accent-800. Foco: negro sobre claro, accent-400 sobre oscuro.
- Advertencia en naranja quemado (`#FDECDD` / `#E8590C` / `#8F3606`), siempre con ícono y texto; rojo solo para errores, verde éxito, azul información.
- Tipografía Geist (400/500/600/700), sin serifas, cifras tabulares en precios y horarios.
- Botones en píldora; radios 8/12/16/24; botón principal negro con texto blanco (acento con texto negro sobre fondo oscuro).
- Tokens en `docs/design/havana-tokens-v2.css` (+ `src/styles/accent.css`). Verificar contraste con `npm run contrast` después de cualquier cambio de color.

## Políticas de reserva (configurables)
Cancelar o reprogramar hasta 4 h antes; anticipación mínima 1 h y máxima 30 días; cuadrícula de 15 min; tolerancia 10 min; máximo 2 citas futuras activas por cliente; reserva sin cuenta (nombre, teléfono, correo). Lealtad: 10 sellos = corte gratis; el sello se gana al completar la cita.

## Datos del negocio
Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro. · Tel. 442 537 7844 · L–V 10:00–20:30, sáb 10:00–18:00, dom 10:00–15:00 (confirmar domingo).

## Flujo de trabajo
Rama por funcionalidad, commits pequeños (Conventional Commits), PR hacia `main`. Verificar lint, typecheck, pruebas y build antes de cada PR.

## Herramientas de diseño
Skills instaladas en `.claude/skills/`: `impeccable` (usar `impeccable detect` sobre la app corriendo antes de cerrar cambios de UI) y `ui-ux-pro-max`.
