import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

// Read version + name from root package.json
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"));

// https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_NAME__: JSON.stringify("machete"),
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __APP_AUTHOR__: JSON.stringify("Frontier Collective"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
