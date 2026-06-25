// frontend/vite.config.js

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
  ],

  css: {
    modules: {
      localsConvention: "camelCase",
      generateScopedName: "[name]__[local]___[hash:base64:5]",
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      components: path.resolve(__dirname, "./src/components"),
      pages: path.resolve(__dirname, "./src/pages"),
      utils: path.resolve(__dirname, "./src/utils"),
      assets: path.resolve(__dirname, "./src/assets"),
    },
  },

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    cssCodeSplit: true,
    minify: "esbuild",
    target: "es2019",
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (
            id.includes("react/") ||
            id.includes("react-dom") ||
            id.includes("react-router-dom") ||
            id.includes("scheduler")
          ) {
            return "vendor-react";
          }

          if (
            id.includes("@reduxjs/toolkit") ||
            id.includes("react-redux") ||
            id.includes("redux-persist")
          ) {
            return "vendor-redux";
          }

          if (
            id.includes("react-select") ||
            id.includes("@floating-ui") ||
            id.includes("react-datepicker")
          ) {
            return "vendor-ui";
          }

          if (
            id.includes("jspdf") ||
            id.includes("html2canvas") ||
            id.includes("html-to-image") ||
            id.includes("xlsx") ||
            id.includes("d3")
          ) {
            return "vendor-heavy-tools";
          }

          if (
            id.includes("lucide-react") ||
            id.includes("react-icons") ||
            id.includes("@fortawesome")
          ) {
            return "vendor-icons";
          }

          if (
            id.includes("formik") ||
            id.includes("yup") ||
            id.includes("dompurify")
          ) {
            return "vendor-forms";
          }

          if (id.includes("axios")) {
            return "vendor-api";
          }

          return "vendor-misc";
        },
      },
    },
  },

  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "axios",
      "react-select",
      "lucide-react",
    ],
    exclude: [
      "country-state-city",
      "jspdf",
      "html2canvas",
      "html-to-image",
      "xlsx",
      "d3",
    ],
  },
});