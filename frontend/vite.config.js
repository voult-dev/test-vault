import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Proxy /api to the Express server so auth cookies stay same-site.
export default defineConfig({
  plugins: [react()],
  // changeOrigin: false keeps Host as localhost:5173 so the OAuth callback URL matches the allowlist;
  // Vite's string shorthand sets changeOrigin: true, which rewrites it to localhost:3000.
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } } },
})
