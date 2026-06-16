import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies the API surfaces to the NestJS backend on :3000 so the
// frontend can call /plots/:id/reserve, /api/finance/* and /leases/:id/statement
// with no CORS setup. NB: '/leases' (the API prefix) does not match the SPA
// deep-link path '/leasing', so the Leasing tab still serves index.html.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/plots': { target: 'http://localhost:3000', changeOrigin: true },
      '/leases': { target: 'http://localhost:3000', changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
