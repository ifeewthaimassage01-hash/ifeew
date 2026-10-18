import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      // devOptions: เสิร์ฟ manifest + SW ในโหมด dev ด้วย (ไม่งั้น dev ขึ้น Manifest syntax error
      // เพราะ vite ตอบ index.html กลับมาแทน — ของ production มีไฟล์จริงอยู่แล้ว)
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png', 'logo.jpg'],
      manifest: {
        name: "I'FEEW Thai Massage — POS",
        short_name: "I'FEEW POS",
        description: 'POS ร้านนวดไทย I\u2019FEEW — เปิดบิล ค่าคอม รายรับรายจ่าย',
        lang: 'th',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf8f3',
        theme_color: '#64513e',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } },
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // M10: แยก chunk ระดับ config อย่างเดียว (ไม่ย้าย import ข้ามไฟล์)
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
