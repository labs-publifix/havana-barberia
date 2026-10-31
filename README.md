# Havana Barbería

Sistema de citas y administración de Havana Barbería.

**Sitio:** https://labs-publifix.github.io/havana-barberia/

- Reservar: https://labs-publifix.github.io/havana-barberia/#/reservar
- Panel del equipo: https://labs-publifix.github.io/havana-barberia/#/admin (PIN de prueba `2468`)

Cada push a `main` o a una rama `claude/**` se publica automáticamente con GitHub Actions.

## Desarrollo

```bash
npm install
npm run dev
npm test
npm run build
```

## Estado actual

Versión de prueba: los datos se guardan en el navegador de cada persona, así que una cita hecha en un teléfono no aparece en otro. El siguiente paso es conectar una base de datos para que clientes y panel compartan la misma información.
