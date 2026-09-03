import { defineConfig } from "vite";

import react from "@vitejs/plugin-react";

// Web deploys under /TestBox/ (GitHub Pages). Packaged builds
// (Electron, Capacitor) load from the bundle root and need relative
// assets: run `vite build --mode packaged`.
const base =
  process.env.PACKAGED_BUILD === "1" ? "./" : "/TestBox/";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "packaged" ? "./" : base,
}));
