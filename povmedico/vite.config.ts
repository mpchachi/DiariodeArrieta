import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const appBase = process.env.FIXEDGAP_BASE || '/';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    // Ruta absoluta a las fuentes de la app del operador (carpeta padre del dashboard), para que
    // funcione también en rutas profundas como /dashboard/patient/<id>.
    name: 'fixedgap-fonts-href',
    transformIndexHtml: html => html.replace('%APP_BASE%', appBase),
  }],
  // Se sirve dentro de la app: <FIXEDGAP_BASE>dashboard/ (p. ej. /plataforma/dashboard/).
  base: `${process.env.FIXEDGAP_BASE || '/'}dashboard/`,
  // Mismo .env que la app del juego (demo/.env): una sola fuente para la URL y la clave de Supabase.
  envDir: '../demo',
  server: {
    port: 4000,
  },
  build: {
    outDir: '../demo/public/dashboard',
    emptyOutDir: true,
  }
})
