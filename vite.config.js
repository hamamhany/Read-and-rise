import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', 
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // إضافة manifest بخصائص أساسية لمنع أي خطأ في البناء
      manifest: {
        name: 'Read and Rise',
        short_name: 'ReadRise',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // هذا السطر هو الحل لمشكلة Build Failed التي واجهتها
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // تجاهل الملفات الكبيرة التي لا تحتاج لـ caching
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  server: { 
    port: 3000,
    // تحسين الأداء أثناء التطوير
    watch: {
      usePolling: true
    }
  },
  build: {
    // تحسين حجم الملفات النهائية (للنمو وسرعة التحميل)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});