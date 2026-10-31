# Havana Barbería · Sistema de citas

Reservas en línea para Havana Barbería (Querétaro). Móvil primero, en español de México.

**Vista previa:** https://labs-publifix.github.io/havana-barberia/ (se publica al fusionar a `main`).

## Desarrollo

```bash
cp .env.example .env   # opcional
npm install
npm run dev
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local |
| `npm run build` / `npm run preview` | Build de producción y vista previa |
| `npm run lint` · `npm run typecheck` · `npm test` | Calidad |
| `npm run e2e` | Recorridos y capturas con Playwright |

Arquitectura y cómo conectar Supabase: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Reglas del proyecto: [`CLAUDE.md`](CLAUDE.md).
