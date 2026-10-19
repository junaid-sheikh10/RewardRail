import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, the frontend calls /api/... and Vite forwards it to the NestJS API.
// That avoids CORS issues and hard-coded URLs in components.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Ready for Phase 3 (Socket.IO).
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
