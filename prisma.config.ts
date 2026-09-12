import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 keeps the connection URL out of schema.prisma. The CLI (migrate,
// db push, studio) reads it from here; the runtime client gets it through the
// pg driver adapter in src/lib/prisma.ts.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Read lazily: `prisma generate` must work without a database configured
    // (e.g. during a CI build), only migrate/push/studio actually connect.
    url: process.env.DATABASE_URL ?? "",
  },
});
