import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const base = fileURLToPath(new URL("../src/", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  resolve: {
    alias: [
      // Intercept network access: the actual production card renders with deterministic traces.
      { find: "@/lib/api", replacement: fileURLToPath(new URL("./mock-api.ts", import.meta.url)) },
      { find: "@", replacement: base },
    ],
  },
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
});
