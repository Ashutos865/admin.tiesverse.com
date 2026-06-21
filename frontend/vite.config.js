import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Django admin API
      '/api/token': 'http://localhost:8000',
      '/api/accounts': 'http://localhost:8000',
      '/api/tiesverse': 'http://localhost:8000',
      '/api/career-django': 'http://localhost:8000',
      '/api/webinar-django': 'http://localhost:8000',
      // Node.js Supabase/Turso API — proxied so the frontend can call /node/*
      '/node': {
        target: 'http://localhost:5000',
        rewrite: (path) => path.replace(/^\/node/, ''),
      },
    },
  },
})
