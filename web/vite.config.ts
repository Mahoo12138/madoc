import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin({ identifiers: 'short' })],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mantine: ['@mantine/core', '@mantine/hooks'],
          editor: ['@milkdown/crepe'],
          whiteboard: ['@excalidraw/excalidraw'],
        },
      },
    },
  },
  esbuild: { target: 'es2022' },
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', changeOrigin: true, ws: true },
      '/healthz': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
