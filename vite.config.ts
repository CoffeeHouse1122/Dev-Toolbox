import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  root: ".",
  publicDir: "build",
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
      "@shared": path.resolve(__dirname, "src/shared")
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false
  },
  server: {
    strictPort: true
  }
});

