import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Proxy /api to the Express server so auth cookies stay same-site.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
