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
  // Bind IPv4 loopback: on some Windows setups connecting to the default
  // [::1] binding fails with EACCES, breaking the dev server entirely.
  server: {
    host: "127.0.0.1",
  },
}));
