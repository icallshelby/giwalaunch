import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app under /giwalaunch/ — base must match or the
// site loads blank. All asset/route paths are relative to this base.
export default defineConfig({
  base: '/giwalaunch/',
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
  define: {
    // The Ammora SDK reads process.env in a few spots; Vite does not
    // polyfill `process` in the browser. Provide an empty shim.
    'process.env': {},
  },
});
