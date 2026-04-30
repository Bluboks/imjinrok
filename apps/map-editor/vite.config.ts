import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(workspaceRoot, "packages/shared/src"),
      "@simulation": path.resolve(workspaceRoot, "packages/simulation/src"),
    },
  },
  server: {
    port: 5175,
  },
  build: {
    outDir: path.resolve(workspaceRoot, "dist/map-editor"),
    emptyOutDir: true,
  },
});
