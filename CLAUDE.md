# Havana Barbería

Repositorio del futuro sistema de citas y administración de Havana Barbería. **El desarrollo del sistema todavía no ha empezado**: hoy solo se publica una página de "Próximamente". No construir el sistema hasta que el dueño lo pida.

Sitio publicado: https://labs-publifix.github.io/havana-barberia/

## Flujo de trabajo: cada ronda termina publicada

El dueño del proyecto pidió que **al terminar cada ronda de desarrollo los cambios queden publicados automáticamente**. Al cerrar una ronda:

1. Commit con mensaje descriptivo y `git push` a la rama de trabajo.
2. El workflow `.github/workflows/deploy.yml` se dispara con cada push a `main` o `claude/**` y publica la carpeta `site/` en GitHub Pages. Verificar que el run termine en verde.
3. Cerrar la ronda dándole al usuario la liga del sitio publicado.

Pages tiene un solo sitio por repo: lo publicado es siempre el último push. Si más adelante el sitio pasa a tener build (npm), el workflow debe construir y subir la carpeta de salida en lugar de `site/`.

## Estructura

- `site/index.html`: página de "Próximamente" (HTML y CSS en un solo archivo, sin build).
- `site/logo.jpg`: copia del logo original `HAVANA-BARBERIA-LOGO.jpg`.

## Diseño

Mundo visual tomado del logo: tinta negra, gris del poste (#c8c8c8), papel blanco; tipografía geométrica Jost. Las franjas diagonales (`.pole`) son el poste de barbería del logo y son intencionales.

Skills de diseño instaladas en `.claude/skills/`: `impeccable` y `ui-ux-pro-max`.
