import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Generated reports and verification checkouts must not reload a live game.
    watch: { ignored: ['**/output/**'] },
  },
});
