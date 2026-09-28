import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: process.cwd(),
  // The app's static files, such as the fallback tier's microphone worklet.
  publicDir: "client/public",
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
