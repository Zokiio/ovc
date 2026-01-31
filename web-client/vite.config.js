import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl() // Enables HTTPS for getUserMedia API
  ],
  server: {
    host: true,
    port: 8000,
    https: true,
    open: true,
    proxy: {
      '/voice': {
        target: process.env.VITE_SIGNALING_TARGET || 'ws://localhost:24455',
        ws: true,
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    host: true,
    port: 8000,
    https: true
  }
});
