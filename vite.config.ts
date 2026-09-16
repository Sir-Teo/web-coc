import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('src/ui/')) return 'ui';
          if (id.includes('src/dev/')) return 'dev';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Generated reports and verification checkouts must not reload a live game.
    watch: { ignored: ['**/output/**', '**/art/source/native-client-*/files/**'] },
  },
});
