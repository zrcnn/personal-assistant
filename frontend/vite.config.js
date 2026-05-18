import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '..', 'ssl', 'key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '..', 'ssl', 'cert.pem'))
    },
    host: 'localhost',
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    modulePreload: true,
    rolldownOptions: {
      output: {
        codeSplitting: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor')) return 'monaco-editor'
          if (id.includes('xterm') || id.includes('@xterm')) return 'xterm'
          if (id.includes('chart.js') || id.includes('chartjs')) return 'chart'
          if (id.includes('highlight.js')) return 'highlight'
          if (id.includes('marked')) return 'marked'
        },
      },
    },
  },
})
