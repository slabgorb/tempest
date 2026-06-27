import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Served under /tempest/ on arcade.slabgorb.com (the SFX already live at
  // /tempest/sfx/). Vite rewrites root-relative asset URLs to honour this base
  // in both dev and build, so index.html's /src/main.ts resolves correctly.
  base: '/tempest/',
  // Pin a dedicated port. strictPort fails loudly on a collision instead of
  // silently wandering to 5174/5175 like the default 5173.
  server: {
    port: 5273,
    strictPort: true,
    // The Cloudflare tunnel forwards requests with Host: arcade.slabgorb.com.
    // Vite blocks unrecognised Hosts (DNS-rebinding protection) unless they are
    // allow-listed, so the tunnel would otherwise get a 403.
    allowedHosts: ['arcade.slabgorb.com'],
  },
  preview: {
    port: 5273,
    strictPort: true,
    allowedHosts: ['arcade.slabgorb.com'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
