import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // When the app is served via a proxy (e.g. backend on :5000 → Vite on :5173), HMR
    // must connect to the Vite dev server. If you use the same origin (e.g. :5000),
    // ensure your backend proxies WebSocket upgrade requests to Vite (e.g. /vite-hmr → :5173).
    hmr: {
      host: "localhost",
      port: 5173,
      protocol: "ws",
    },
  },
});
