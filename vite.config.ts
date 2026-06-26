import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Pin a dedicated port. strictPort fails loudly on a collision instead of
  // silently wandering to 5174/5175 like the default 5173.
  server: {
    port: 5273,
    strictPort: true,
  },
  preview: {
    port: 5273,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
