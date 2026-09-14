import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 keeps the connection URL out of schema.prisma. The CLI (migrate,
// db push, studio) reads it from here; the runtime client gets it through the
// pg driver adapter in src/lib/prisma.ts.
/**
 * Schema changes need a direct connection, not a pooled one.
 *
 * Managed Postgres providers hand out a connection pooler as the headline
 * DATABASE_URL, which is the right thing for serving requests but routinely
 * fails for DDL - the pooler multiplexes sessions, and creating tables needs a
 * session of its own. Those providers publish the direct connection under a
 * second name, so prefer it here and fall back to DATABASE_URL when there is
 * only one URL to choose from (a plain local Postgres, for instance).
 *
 * The runtime client in src/lib/prisma.ts deliberately keeps using the pooled
 * DATABASE_URL - pooling is what you want once the app is actually serving.
 */
const directUrl =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  "";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Read lazily: `prisma generate` must work without a database configured
    // (e.g. during a CI build), only migrate/push/studio actually connect.
    url: directUrl,
  },
});
