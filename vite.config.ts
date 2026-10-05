import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, as chamadas /api vão para o servidor Node (server/index.ts).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
