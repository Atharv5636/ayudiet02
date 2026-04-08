import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@clerk")) {
            return "vendor-clerk";
          }

          if (id.includes("@react-pdf")) {
            return "vendor-pdf";
          }

          if (id.includes("recharts") || id.includes("/d3-")) {
            return "vendor-charts";
          }

          if (id.includes("axios")) {
            return "vendor-http";
          }

          if (id.includes("zustand")) {
            return "vendor-state";
          }

          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          return "vendor-misc";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
