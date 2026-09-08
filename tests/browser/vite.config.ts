import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: process.cwd(),
  server: {
    host: "localhost",
    port: 5176,
    strictPort: true,
    watch: {
      ignored: [
        "**/client/dist/**",
        "**/dist/**",
        "**/test-results/**",
        "**/playwright-report/**",
      ],
    },
  },
});
