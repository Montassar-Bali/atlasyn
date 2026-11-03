import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The local Python service powers only the AI Copilot. Everything else under /api is a Vercel function
// (run them locally with `npx vercel dev`). Point at another backend with ATLASYN_API_TARGET.
const apiTarget = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.ATLASYN_API_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei'],
  },
  server: {
    proxy: {
      '^/api/(health|models|conversations|chat|memories)': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['atlasyn-logo.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'ATLASYN Insight',
        short_name: 'ATLASYN',
        description: 'Executive intelligence platform for operational decision-making',
        theme_color: '#F5F4FB',
        background_color: '#F5F4FB',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // API calls must always reach the network (attendance is verified live, never from cache).
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // The desktop-only WebGL runtime is intentionally lazy-loaded as one cacheable chunk.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/') || id.includes('/node_modules/@react-three/')) return 'experience-runtime'
          if (id.includes('/node_modules/gsap/')) return 'motion-runtime'
          if (id.includes('/node_modules/lucide-react/')) return 'icons'
          if (id.includes('/node_modules/victory-vendor/')) return 'visualization-core'
          if (id.includes('/node_modules/@reduxjs/') || id.includes('/node_modules/react-redux/') || id.includes('/node_modules/reselect/') || id.includes('/node_modules/immer/')) return 'chart-state'
          if (id.includes('/node_modules/recharts/')) return 'charts'
        },
      },
    },
  },
})
