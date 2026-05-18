import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../media',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'webview.js',
        chunkFileNames: 'webview-chunk-[name].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'webview.css';
          return '[name][extname]';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
});
