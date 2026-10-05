import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // No GitHub Pages o app fica em /Notas/; localmente e no servidor Node, na raiz.
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
  server: {
    // Em desenvolvimento, as chamadas /api vão para o servidor Node (server/index.ts).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
