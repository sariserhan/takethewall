import { defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
