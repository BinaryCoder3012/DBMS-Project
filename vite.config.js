import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    proxy: {
      // All /api requests from the React app are forwarded to the Express backend
      '/api': 'http://localhost:3001',
    },
    allowedHosts: true,
  },
})
