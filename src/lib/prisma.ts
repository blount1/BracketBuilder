import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { CANDIDATE_VARS, pooledDatabaseUrl } from "@/lib/db-url";

// Next.js dev server reloads modules on every edit; without the global cache
// each reload would open a fresh pool and eventually exhaust Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  // Pooled, because this is the client that serves requests.
  const connectionString = pooledDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      `No database connection string found. Set DATABASE_URL (or any of: ${CANDIDATE_VARS.join(", ")}). Locally, copy .env.example to .env and point it at your Postgres instance.`,
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
