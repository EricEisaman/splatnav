import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue({ vapor: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  optimizeDeps: {
    exclude: ['@babylonjs/core'],
    include: ['@babylonjs/serializers']
  },
  worker: {
    format: 'es'
  },
  assetsInclude: ['**/*.wasm']
})

