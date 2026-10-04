import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: { alias: { '@': resolve('src') } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8011', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
})
