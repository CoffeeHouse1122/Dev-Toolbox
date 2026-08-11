import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const production = command === "build" && mode === "production";
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim() || "http://localhost:3000";
  const cdnBase = env.VITE_CDN_BASE?.trim();

  return {
    base: command === "build" ? cdnBase || "./" : "./",
    root: ".",
    // `build/` belongs to electron-builder; renderer assets are imported from source explicitly.
    publicDir: false,
    plugins: [vue()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src/renderer", import.meta.url)),
        "@shared": fileURLToPath(new URL("./src/shared", import.meta.url))
      }
    },
    esbuild: production ? { drop: ["console", "debugger"] } : undefined,
    build: {
      // This established Electron project keeps tsc and Vite outputs separate;
      // migrating the working main/preload pipeline to electron-vite is out of scope.
      outDir: "dist/renderer",
      emptyOutDir: true,
      assetsDir: "assets",
      assetsInlineLimit: 4096,
      minify: "esbuild",
      sourcemap: !production,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          entryFileNames: "static/js/[name]-[hash].js",
          chunkFileNames: "static/js/[name]-[hash].js",
          assetFileNames: (assetInfo) => {
            const extension = path.extname(assetInfo.name ?? "").slice(1).toLowerCase();
            if (extension === "css") return "static/css/[name]-[hash][extname]";
            if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico"].includes(extension)) {
              return "static/images/[name]-[hash][extname]";
            }
            return `static/${extension || "assets"}/[name]-[hash][extname]`;
          }
        }
      }
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      open: false,
      hmr: { overlay: true },
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/media": { target: proxyTarget, changeOrigin: true }
      }
    }
  };
});
