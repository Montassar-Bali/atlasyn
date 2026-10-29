import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
