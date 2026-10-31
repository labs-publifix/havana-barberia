import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages sirve el sitio en /havana-barberia/. BASE_PATH permite cambiarlo
// (p. ej. "/" si más adelante se usa un dominio propio).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/havana-barberia/',
  plugins: [react()],
})
