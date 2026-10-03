import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * MapLibre GL v6 loads its web worker from a file next to the map code
 * (new URL('./maplibre-gl-worker.mjs', import.meta.url)). Vite does not bundle that file, so copy the worker and the
 * shared chunk it imports into dist/assets, next to the map chunk. (In dev, optimizeDeps.exclude below does the job.)
 */
function maplibreWorker(): Plugin {
  const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']
  return {
    name: 'maplibre-worker-assets',
    apply: 'build',
    generateBundle() {
      for (const f of files) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/${f}`,
          source: readFileSync(resolve('node_modules/maplibre-gl/dist', f)),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), maplibreWorker()],
  base: './',
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
})
