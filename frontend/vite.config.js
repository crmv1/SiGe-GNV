// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy opcional para desarrollo.
    //
    // La app usa VITE_API_URL (ver frontend/.env.example). Con esa
    // variable definida, el proxy no se usa y todo va directo al
    // puerto 3100, que ya tiene CORS configurado.
    //
    // Se deja disponible para trabajar sin CORS si se prefiere:
    // en ese caso conviene NO definir VITE_API_URL y consumir
    // rutas relativas /api/...
    proxy: {
      '/api': {
        target: 'http://localhost:3100',
        changeOrigin: true,
        // Sin rewrite: el backend ya espera las rutas bajo /api
      },
    },
  },
});
