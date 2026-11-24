import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 4300}`;
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: { '/api': api, '/socket.io': { target: api, ws: true } },
  },
});
