import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the same /dist works from a user page, a project page
// (https://user.github.io/tour-life/) or a plain file:// open.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
