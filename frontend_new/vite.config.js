import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3600,          // منفذ خاص بالبرنامج — 3000 كثيراً ما تحجزه برامج أخرى (Docker…)
    allowedHosts: true,
    strictPort: true,     // لا ينتقل لمنفذ آخر بصمت: إن كان محجوزاً يظهر خطأ واضح
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
