import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: appRoot,
  resolve: {
    alias: {
      "@shared": path.resolve(workspaceRoot, "packages/shared/src"),
      "@simulation": path.resolve(workspaceRoot, "packages/simulation/src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: path.resolve(workspaceRoot, "dist/game-client"),
    emptyOutDir: true,
  },
});
