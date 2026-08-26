// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://whatupwolf.com',

  // Static-first: every page prerenders as before. Only routes that opt out
  // (prerender = false — currently just /api/events) run in the Worker.
  adapter: cloudflare(),

  vite: {
    // cast: @tailwindcss/vite ships Vite types that clash with Astro's bundled Vite
    // version. Cosmetic only — the build is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())],
  },

  integrations: [react()],
});
