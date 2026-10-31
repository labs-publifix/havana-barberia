# Havana Barbería: sistema de citas y administración

App web (Vite + React + TypeScript) con dos partes:
- **Pública** (`/#/`, `/#/reservar`, `/#/cita/:id`): los clientes ven servicios y horario y reservan.
- **Panel** (`/#/admin`): agenda del día, lista de citas, servicios, barberos y ajustes.

Sitio publicado: https://labs-publifix.github.io/havana-barberia/

## Flujo de trabajo: cada ronda termina publicada

El dueño del proyecto pidió que **al terminar cada ronda de desarrollo los cambios queden publicados automáticamente**. Al cerrar una ronda:

1. `npm test` y `npm run build` deben pasar.
2. Commit con mensaje descriptivo y `git push` a la rama de trabajo.
3. El workflow `.github/workflows/deploy.yml` se dispara con cada push a `main` o `claude/**`, corre pruebas y build, y publica en GitHub Pages. Verificar que el run termine en verde.
4. Cerrar la ronda dándole al usuario la liga del sitio publicado.

Pages tiene un solo sitio por repo: lo publicado es siempre el último push.

## Comandos

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas (vitest)
npm run build    # typecheck + build a dist/
```

## Arquitectura

- `src/data/types.ts`: modelo (Service, Barber, BusinessSettings, Appointment).
- `src/data/store.ts`: interfaz `Repository` + `LocalRepository` (localStorage). **Hoy los datos viven solo en el navegador de cada quien.** Para producción se agrega una implementación con backend (p. ej. Supabase) con la misma interfaz y se cambia el export `repo`.
- `src/lib/time.ts`: `availableSlots()` calcula horarios libres (horario del negocio, días del barbero, traslapes, anticipación mínima). Tiene pruebas en `time.test.ts`; cualquier cambio a la lógica de disponibilidad lleva prueba.
- Rutas con `HashRouter` porque GitHub Pages solo sirve archivos estáticos.
- El acceso al panel es un PIN provisional en el código (`AdminLayout.tsx`), no es seguridad real; se reemplaza al conectar el backend.

## Diseño

Mundo visual tomado del logo (`HAVANA-BARBERIA-LOGO.jpg`, copia en `public/logo.jpg`): tinta negra, gris del poste (#c8c8c8), papel blanco; tipografía geométrica Jost. Las rayas diagonales (`.pole`) son el poste de barbería del logo y son intencionales. Tokens en `src/styles/global.css`.

Skills de diseño instaladas en `.claude/skills/`: `impeccable` (usar `impeccable detect` sobre el sitio corriendo antes de cerrar una ronda con cambios de UI) y `ui-ux-pro-max`.
