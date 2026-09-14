import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";
import { directDatabaseUrl } from "./src/lib/db-url";

// Prisma 7 keeps the connection URL out of schema.prisma. The CLI (migrate,
// db push, studio) reads it from here; the runtime client gets it through the
// pg driver adapter in src/lib/prisma.ts.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Schema changes need a direct connection, not a pooled one - see
    // src/lib/db-url.ts. Resolved lazily so `prisma generate` still works with
    // no database configured, as during a build that only needs the client.
    url: directDatabaseUrl() ?? "",
  },
});
