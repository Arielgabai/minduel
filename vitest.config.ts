import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    // Plusieurs suites font un import() dynamique du graphe de providers : la
    // première transformation peut dépasser 5 s sur une machine chargée.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Neutralise "server-only" (marqueur runtime Next) dans l'environnement de test.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
