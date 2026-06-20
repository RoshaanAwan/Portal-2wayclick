import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test config. Two project shapes share this file:
//   • unit (lib/**/*.test.ts)            — pure logic, no DB, runs anywhere.
//   • integration (lib/**/*.itest.ts)    — hits the local Postgres via Prisma;
//                                          requires DATABASE_URL (skipped if absent).
// Node environment — these are backend/logic tests, no DOM.
export default defineConfig({
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" → project root alias so imports match app code.
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Integration tests serialize DB access; keep them off the default fast unit
    // run by matching only *.test.ts here. The integration runner uses its own
    // include via the npm script.
    include: ["**/*.test.ts"],
    exclude: [
      "node_modules/**",
      ".next/**",
      // Legacy hand-rolled harness tests (run via `npm run test:legacy` with tsx).
      // They predate Vitest and use console-assertion + process.exit, not
      // describe/it, so Vitest can't collect them. They still pass on tsx.
      "lib/__tests__/duration.test.ts",
      "lib/__tests__/formula.test.ts",
    ],
    // Integration tests create/delete rows; avoid parallel interference.
    fileParallelism: false,
  },
});
