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
- Logo: usar solo mediante `<Logo variant="white" | "black" />`. `white` en navbar, footer y cualquier fondo oscuro; `black` solo sobre fondos claros (p. ej. el encabezado del flujo de reserva). Hoy son WebP con alfa generados desde `src/assets/brand/*-source.png`. TODO(logo-svg): reemplazar por el SVG oficial (blanco y negro) en `src/components/Logo.tsx`; nada más cambia.
- Recursos: originales en `src/assets/{brand,services,team,video,gallery}/*-source.*`; versiones web con `python3 scripts/optimize-assets.py` (nunca escala hacia arriba). Fotos con `width`/`height` y `loading="lazy"` fuera del primer pantallazo.

## Diseño (tokens v2)
- Negro base `#0A0A0B`; acento único aqua Caribe `#14DDB6` (texto de acento sobre claro: `#076B5A`); rojo solo para errores.
- Tipografía Geist (400/500/600/700), sin serifas, cifras tabulares en precios y horarios.
- Botones en píldora; radios 8/12/16/24; botón principal negro con texto blanco (aqua con texto negro sobre fondo oscuro).
- Aqua brillante solo sobre oscuro y con moderación: en el hero un solo elemento relleno (el CTA principal); el «Reservar» del navbar va en contorno blanco sobre el hero y en aqua cuando flota. Nunca titulares en aqua. Sobre claro solo aqua-800 para texto. Nunca hexadecimales sueltos: tokens en `src/styles/tokens.css` y `docs/design/`.
- Tokens completos en `src/styles/tokens.css` (y `docs/design/` si existe).

## Sitio público (portada y páginas internas)
- Rutas públicas: `/` (portada), `/servicios`, `/politicas`, `/privacidad`, 404. Flujo de reserva (no tocar sin pedirlo): `/reservar`, `/confirmacion/:token`, `/cita/:token`, `/lealtad/:token`. Enlaces al flujo con preselección: `routes.bookWith({ serviceIds, staffId, step })` (usa los parámetros que el flujo ya lee).
- Portada en este orden: hero (video de fondo; abajo a la izquierda: calificación, titular en blanco, línea de precios y horario, un solo CTA relleno y tarjetas «¿Con quién te sientas?» que abren el flujo con el barbero preseleccionado) · reseñas (`#resenas`) · tratamientos (`#tratamientos`) · barberos (`#barberos`) · galería (`#galeria`) · ubicación (`#ubicacion`) · CTA final · footer. Todo en oscuro.
- `HeroBackdrop`: capa fija detrás de la página; desenfoque y velo según `--hero-progress` (un solo listener con rAF). Reseñas, tratamientos y barberos van con fondo transparente; galería en adelante, negro sólido (pausa el video).
- `SiteNav`: un solo componente; transparente sobre el hero y píldora flotante después de 24 px; `startFloating` en páginas internas. `MobileBookBar` aparece al salir del hero.
- Animación: CSS + IntersectionObserver (`Reveal`), sin librerías; todo respeta `prefers-reduced-motion` (el marquee se vuelve lista manual).
- Contenido sin inventar: reseñas en `src/config/reviews.ts` (hoy marcadores), rol y bio de barberos en `src/config/team.ts` (vacíos), insignias en `src/config/serviceBadges.ts` (vacío), `business.instagramUrl` (null = botón oculto).
- Estrellas de Google en amarillo (`text-google-star`), no en el acento.

## Políticas de reserva (configurables)
Cancelar o reprogramar hasta 4 h antes; anticipación mínima 1 h y máxima 30 días; cuadrícula de 15 min; tolerancia 10 min; máximo 2 citas futuras activas por cliente; reserva sin cuenta (nombre, teléfono, correo). Lealtad: 10 sellos = corte gratis; el sello se gana al completar la cita.

## Datos del negocio
Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro. · Tel. 442 537 7844 · L–V 10:00–20:30, sáb 10:00–18:00, dom 10:00–15:00 (confirmar domingo).

## Flujo de trabajo
Rama por funcionalidad, commits pequeños (Conventional Commits), PR hacia `main`. Verificar lint, typecheck, pruebas y build antes de cada PR.

## Herramientas de diseño
Skills instaladas en `.claude/skills/`: `impeccable` (usar `impeccable detect` sobre la app corriendo antes de cerrar cambios de UI) y `ui-ux-pro-max`.
