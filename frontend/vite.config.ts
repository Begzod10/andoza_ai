import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  cacheDir: "/tmp/vite-cache",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "UyTa'mir",
        short_name: "UyTa'mir",
        description: "Kvartira ta'mirlash",
        theme_color: "#D85A30",
        background_color: "#F6F4EF",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy Three.js / React-Three ecosystem into dedicated
        // vendor chunks. These are only pulled in by the lazy-loaded studio
        // pages, so they stay out of the initial bundle and are cached/shared
        // across every 3D page (ThreeDPage, Placement, Walkthrough, Isometric).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](three|three-stdlib)[\\/]/.test(id)) {
            return "three-vendor";
          }
          if (
            id.includes("@react-three") ||
            /[\\/]node_modules[\\/](postprocessing|maath)[\\/]/.test(id)
          ) {
            return "react-three-vendor";
          }
        },
      },
    },
  },
  server: {
    // Inotify events don't cross the Windows→Docker bind mount, so Vite's
    // module cache goes stale without polling (edits silently never served).
    watch: {
      usePolling: true,
      interval: 800,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
