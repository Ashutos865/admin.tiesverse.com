import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,      // admin uses 5173/5174, docs 5175
  },
  preview: {
    port: 4176,
  },
});
