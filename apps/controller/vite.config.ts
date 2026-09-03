import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // En prod lo sirve el server de Perty bajo /j.
  base: '/j/',
  server: { host: true, port: 5174 },
});
