import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shadcn/ui's generated components import from "@/..." (their convention,
    // not this app's). Kept to that one alias so pasted-in component source
    // needs no rewriting; everything else in the app still uses relative
    // imports as before.
    alias: {
      '@': path.resolve(here, './src'),
    },
  },
  server: {
    port: 5173,
    // Proxying /api keeps the browser on a single origin, so the httpOnly
    // refresh cookie is sent with no CORS or SameSite gymnastics.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
