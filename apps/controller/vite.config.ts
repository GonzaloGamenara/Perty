import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import browserslist from 'browserslist';
import { browserslistToTargets } from 'lightningcss';
import { defineConfig } from 'vite';

/**
 * El navegador de una smart TV va clavado al año del modelo: un Samsung de 2022
 * anda por Chromium 94. Tailwind v4 emite oklch() y color-mix(), que recién
 * llegaron en Chrome 111, así que sin esto la tele se ve rota.
 * Lightning CSS baja esas funciones a colores que entiende un navegador viejo.
 */
const targets = browserslistToTargets(browserslist('chrome >= 90, safari >= 14, firefox >= 90'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // En prod lo sirve el server de Perty bajo /j.
  base: '/j/',
  css: { transformer: 'lightningcss', lightningcss: { targets } },
  build: { cssMinify: 'lightningcss', target: 'es2020' },
  server: { host: true, port: 5174 },
});
