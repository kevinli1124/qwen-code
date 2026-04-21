import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          xterm: ['@xterm/xterm', '@xterm/addon-fit'],
          webui: ['@qwen-code/webui'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
