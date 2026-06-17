import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During `npm run dev`, proxy the protocol endpoints to the local server
// (run `npm run serve` in another terminal) so the round-trip works in dev too.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4321',
    },
  },
  build: {
    outDir: 'dist',
  },
})
