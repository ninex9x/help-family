import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "demo"),
  base: "/cura-family/",
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, "demo-dist"),
    emptyOutDir: true,
  },
});
