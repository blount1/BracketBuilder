import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests share one Postgres database, so they must not interleave.
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
});
