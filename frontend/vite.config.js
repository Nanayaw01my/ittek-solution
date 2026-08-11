import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inject registration script automatically into index.html
      injectRegister: 'auto',
      workbox: {
        // Precache ALL build output — JS, CSS, HTML, fonts, icons
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}'],
        // SPA fallback: any navigation request gets index.html from cache
        navigateFallback: '/index.html',
        // But never intercept /api/* — let those fail so the offline queue handles them
        navigateFallbackDenylist: [/^\/api\//],
        // Don't runtime-cache API responses — only precache build assets
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      // Static assets that aren't Vite build output still need precaching,
      // or the installed app has no icon while offline.
      includeAssets: ['icons/*.png'],
      manifest: {
        id: '/',
        name: 'ITTEK Solution — DAN & DOR SOLAR',
        short_name: 'ITTEK',
        description: 'Point of sale, inventory and business management for DAN & DOR SOLAR.',
        theme_color: '#F97316',
        background_color: '#0f0f0f',
        display: 'standalone',
        // Falls back left to right, so browsers without window-controls-overlay
        // still get a normal standalone window.
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        // The till is what staff open the app for.
        start_url: '/pos',
        scope: '/',
        lang: 'en',
        categories: ['business', 'productivity', 'finance'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Right-click the taskbar/dock icon to jump straight to a screen.
        shortcuts: [
          {
            name: 'Point of Sale',
            short_name: 'POS',
            url: '/pos',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Dashboard',
            short_name: 'Dashboard',
            url: '/dashboard',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Sales History',
            short_name: 'Sales',
            url: '/sales-history',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      // Don't generate a dev SW — only in production build
      devOptions: { enabled: false },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
