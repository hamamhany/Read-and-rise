import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Read and Rise',
        short_name: 'ReadRise',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        // ✅ زيادة الحد الأقصى لحجم الملفات التي يتم تخزينها مؤقتاً إلى 15 ميجابايت
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: {
    port: 3000,
    watch: {
      usePolling: true
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // تحسين تقسيم الكود لتقليل حجم vendor
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // تقسيم الحزم الكبيرة إلى ملفات منفصلة
            if (id.includes('firebase')) {
              return 'firebase';
            }
            if (id.includes('@zoom')) {
              return 'zoom-sdk';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react';
            }
            // باقي الحزم
            return 'vendor';
          }
        }
      }
    }
  }
});