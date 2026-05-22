import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return null;
          if (
            id.includes('/recharts/')
            || id.includes('/apexcharts/')
            || id.includes('/react-apexcharts/')
          ) {
            return 'vendor-charts';
          }
          if (
            id.includes('/react/')
            || id.includes('/react-dom/')
            || id.includes('/react-router-dom/')
            || id.includes('/zustand/')
          ) {
            return 'vendor-core';
          }
          return null;
        }
      }
    }
  },
  server: {
    port: 5173,
    host: '127.0.0.1'
  }
});
