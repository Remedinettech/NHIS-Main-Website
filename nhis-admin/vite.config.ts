import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Development serves at "/" (port 5174, /api proxied to the local API).
 * Production builds are published as an IIS application, so the base defaults to "/TNNHISAdmin/" and can be changed
 * with VITE_BASE_PATH (see .env.production). The router basename is derived from this base (src/config/base.ts).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configured = env.VITE_BASE_PATH?.trim();
  const base = configured || (mode === 'production' ? '/TNNHISAdmin/' : '/');
  return {
    base: base.endsWith('/') ? base : `${base}/`,
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: true } },
    },
  };
});
