import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            if (id.includes('/src/pages/reportes/')) return 'page-reportes';
            if (id.includes('/src/pages/admin/')) return 'page-admin';
            if (id.includes('/src/pages/ventas/')) return 'page-ventas';
            return null;
          }
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
