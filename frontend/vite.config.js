// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
  ],

  // CSS Modules + SCSS
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]',
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@import "./src/styles/_variables.scss";`,
      },
    },
  },

  // Aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      components: path.resolve(__dirname, './src/components'),
      pages: path.resolve(__dirname, './src/pages'),
      utils: path.resolve(__dirname, './src/utils'),
      assets: path.resolve(__dirname, './src/assets'),
    },
  },

  // Development Server + Proxy (MOST IMPORTANT FIX)
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: true,

    proxy: {
      // Proxy ALL /api requests to backend (port 5000)
      '/api': {
        target: 'http://localhost:5000',      // backend URL
        changeOrigin: true,
        secure: false,
        // NO rewrite needed – backend routes already have /api prefix
        // If backend routes are WITHOUT /api (e.g. /tournaments/:id), then add:
        // rewrite: (path) => path.replace(/^\/api/, '')
      },

      // Proxy uploads folder for images/posters/logos
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Build config
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: process.env.NODE_ENV === 'development',

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios'],
          ui: ['react-select', 'react-datepicker', '@floating-ui/react', '@floating-ui/dom'],
          form: ['formik', 'yup'],
          icons: ['react-icons'],
          utils: ['lodash'],
        },
      },
    },
  },

  // Optimize deps for faster dev
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'axios',
      'react-select',
      'react-datepicker',
      '@floating-ui/react',
      '@floating-ui/dom',
      'formik',
      'yup',
      'react-icons',
      'lodash',
    ],
  },
});