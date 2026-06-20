import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests (*.itest.ts) exercise real authorization/query logic against
// the local Postgres via Prisma. They require DATABASE_URL; each test cleans up
// the rows it creates. Run serially so concurrent suites don't race on shared
// rows. Use `npm run test:integration`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // 'server-only' is a Next marker package that can't resolve in the Node
      // test runner; stub it so real server modules import cleanly here.
      "server-only": fileURLToPath(
        new URL("./test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.itest.ts"],
    exclude: ["node_modules/**", ".next/**"],
    fileParallelism: false,
    // DB round-trips + seeding need a little more headroom than the default.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
