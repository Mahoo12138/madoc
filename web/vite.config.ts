import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import path from 'node:path';

// Custom plugin to exclude node_modules .css.ts files from vanilla-extract processing
function excludeNodeModulesCssTs(): Plugin {
  return {
    name: 'exclude-node-modules-css-ts',
    enforce: 'pre',
    transform(code, id) {
      // Skip .css.ts files in node_modules
      if (id.includes('node_modules') && id.endsWith('.css.ts')) {
        // Return empty module to skip processing
        return {
          code: 'export default {};',
          map: null,
        };
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    // Add our custom plugin before vanilla-extract
    excludeNodeModulesCssTs(),
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
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@madoc/doc': path.resolve(__dirname, './packages/common/doc/src'),
      '@madoc/editor': path.resolve(__dirname, './packages/frontend/editor/src'),
    },
  },
  optimizeDeps: {
    include: [
      // Include all @blocksuite packages to pre-bundle their .css.ts files
      '@blocksuite/**/*',
      '@blocksuite/affine',
      '@blocksuite/affine/effects',
      '@blocksuite/affine/store',
      '@blocksuite/affine/sync',
      '@blocksuite/affine/schemas',
      '@blocksuite/affine/shared/services',
      '@blocksuite/affine/inlines/reference',
      '@blocksuite/integration-test',
      '@blocksuite/integration-test/effects',
      '@blocksuite/integration-test/view',
      // Include other dependencies
      'yjs',
      'socket.io-client',
      'lit',
      '@preact/signals-core',
      // Include CommonJS modules that need to be converted to ESM
      'lodash.ismatch',
      'bind-event-listener',
      'extend',
      'debug',
      'bytes'
    ],
    exclude: [
      // Exclude our workspace packages from pre-bundling
      '@madoc/doc',
      '@madoc/editor',
      '@blocksuite/affine-block-note',
      '@blocksuite/affine-fragment-outline'
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
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
      '/graphql': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/info': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
