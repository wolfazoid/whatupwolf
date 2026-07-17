// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://whatupwolf.com',

  vite: {
    // cast: @tailwindcss/vite ships Vite types that clash with Astro's bundled Vite
    // version. Cosmetic only — the build is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())],
  },

  integrations: [react()],
});