import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  envPrefix: ["VITE_", "REACT_APP_"],
  build: { outDir: "build", emptyOutDir: true, sourcemap: false,
    target: ["es2020", "chrome87", "firefox78", "safari14", "edge88"] },
  server: { host: "127.0.0.1", strictPort: true },
});
