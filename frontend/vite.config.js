import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: '../backend/public',
    emptyOutDir: true,
    modulePreload: false,
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
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
