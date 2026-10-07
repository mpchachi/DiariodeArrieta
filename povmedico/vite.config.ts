import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
