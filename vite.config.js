import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" ليعمل الموقع تحت أي مسار في GitHub Pages
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "docs", emptyOutDir: true },
});
