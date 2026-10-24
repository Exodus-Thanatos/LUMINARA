import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    // Forward /api/... to the receiver (server/server.js) so the browser never needs its address.
    proxy: { '/api': 'http://localhost:3001' },
  },
})
