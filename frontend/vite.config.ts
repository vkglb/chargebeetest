import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /v1 API calls to the Go backend during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
