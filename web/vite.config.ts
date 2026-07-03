import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'node:path';

const root = __dirname;
const rootNodeModules = path.resolve(root, './node_modules');

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '\\.css\\.ts$',
    }),
    react(),
    vanillaExtractPlugin({
      identifiers: 'short',
    }),
  ],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      '@tanstack/react-router',
    ],
    alias: {
      '@': path.resolve(root, './src'),
      '@madoc/doc': path.resolve(root, './packages/common/doc/src'),
      '@madoc/editor': path.resolve(root, './packages/frontend/editor/src'),
      react: path.resolve(rootNodeModules, './react'),
      'react-dom': path.resolve(rootNodeModules, './react-dom'),
      'react/jsx-runtime': path.resolve(rootNodeModules, './react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(rootNodeModules, './react/jsx-dev-runtime.js'),
    },
  },
  optimizeDeps: {
    include: [
      'yjs',
      'lit',
      '@preact/signals-core',
      'lodash.ismatch',
      'bind-event-listener',
      'extend',
      'debug',
      'bytes',
    ],
    exclude: [
      '@blocksuite',
      '@madoc/doc',
      '@madoc/editor',
      'socket.io-client',
    ],
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
      },
    },
  },
  esbuild: {
    target: 'es2022',
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
        // Configure rewrite to ensure correct path
        rewrite: (path) => path,
      },
      '/graphql': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/info': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
