/**
 * Where the Postgres connection string comes from.
 *
 * Hosting platforms name these variables however they like. A Vercel storage
 * integration prefixes every variable it publishes with a configurable string -
 * often the project name - so a correctly attached database can appear as
 * `bracketbuilder_DATABASE_URL` rather than `DATABASE_URL`. Others use
 * POSTGRES_URL, STORAGE_URL, or a plain DATABASE_URL.
 *
 * So rather than demand one spelling: check the well-known names, then accept
 * any variable whose name *ends* with one of them. A candidate only counts if
 * its value actually looks like a Postgres URL, which keeps unrelated variables
 * (a NEON_AUTH_URL pointing at an https endpoint, say) from being mistaken for
 * a database.
 *
 * Two different URLs matter:
 *
 *   - pooled: goes through a connection pooler. Right for serving requests,
 *     where many short-lived connections arrive at once.
 *   - direct: a real session. Required for DDL - creating tables through a
 *     pooler fails, because the pooler multiplexes sessions and schema changes
 *     need one to themselves.
 *
 * Where only one URL exists (a plain local Postgres) both resolve to it.
 */

const POOLED_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "STORAGE_URL",
  "POSTGRES_PRISMA_URL",
] as const;

const DIRECT_NAMES = [
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "STORAGE_URL_UNPOOLED",
] as const;

/** A blank variable is worse than a missing one - it looks configured. */
function usable(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  // Only a real Postgres URL qualifies, so a prefixed-name sweep can't pick up
  // some unrelated URL that happens to sit next to the database variables.
  return /^postgres(ql)?:\/\//i.test(trimmed);
}

function resolve(names: readonly string[]): string | undefined {
  // Exact names win, so an explicitly set variable always beats a guess.
  for (const name of names) {
    const value = process.env[name];
    if (usable(value)) return value.trim();
  }
  // Then any prefixed variant, e.g. bracketbuilder_DATABASE_URL.
  for (const name of names) {
    const suffix = `_${name}`;
    for (const [key, value] of Object.entries(process.env)) {
      if (key.endsWith(suffix) && usable(value)) return value.trim();
    }
  }
  return undefined;
}

/** Connection string for serving requests. Prefers a pooled URL. */
export function pooledDatabaseUrl(): string | undefined {
  return resolve(POOLED_NAMES) ?? resolve(DIRECT_NAMES);
}

/** Connection string for schema changes. Prefers a direct, unpooled URL. */
export function directDatabaseUrl(): string | undefined {
  return resolve(DIRECT_NAMES) ?? resolve(POOLED_NAMES);
}

/** Names checked, for error messages that tell you what to actually set. */
export const CANDIDATE_VARS = [...POOLED_NAMES, ...DIRECT_NAMES];
