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
    // Ship the bundled UI UN-minified. The skill commits this build into
    // assets/dist/, and minified/obfuscated executable content is exactly what
    // skill security scanners (Snyk) flag as high risk. An un-minified bundle is
    // readable, auditable JS — our own React app, plain to inspect.
    minify: false,
    // No source maps needed; the un-minified output is the source of truth.
    sourcemap: false,
  },
})
