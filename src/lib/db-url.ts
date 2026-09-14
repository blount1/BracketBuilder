/**
 * Where the Postgres connection string comes from.
 *
 * Hosting platforms name these variables however they like: a Vercel storage
 * integration prefixes them with whatever it was configured with (STORAGE_URL
 * by default, DATABASE_URL only if you say so), while other setups use
 * POSTGRES_URL or a plain DATABASE_URL. Rather than demand one spelling, look
 * for any of the ones actually in use.
 *
 * Two different URLs matter:
 *
 *   - pooled: goes through a connection pooler. Right for serving requests,
 *     where many short-lived connections arrive at once.
 *   - direct: a real session. Required for DDL - creating tables through a
 *     pooler fails, because the pooler multiplexes sessions and schema changes
 *     need one to themselves.
 *
 * Providers that offer both publish the direct one under a second name. Where
 * only one URL exists (a plain local Postgres) both resolve to it.
 */

const POOLED_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "STORAGE_URL",
  "POSTGRES_PRISMA_URL",
] as const;

const DIRECT_VARS = [
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_URL_UNPOOLED",
] as const;

function firstSet(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    // An empty variable is worse than a missing one: it looks configured and
    // silently is not. Treat blank as absent so the next candidate wins.
    if (value && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** Connection string for serving requests. Prefers a pooled URL. */
export function pooledDatabaseUrl(): string | undefined {
  return firstSet(POOLED_VARS) ?? firstSet(DIRECT_VARS);
}

/** Connection string for schema changes. Prefers a direct, unpooled URL. */
export function directDatabaseUrl(): string | undefined {
  return firstSet(DIRECT_VARS) ?? firstSet(POOLED_VARS);
}

/** Names checked, for error messages that tell you what to actually set. */
export const CANDIDATE_VARS = [...POOLED_VARS, ...DIRECT_VARS];
