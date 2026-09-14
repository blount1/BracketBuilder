import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { directDatabaseUrl, pooledDatabaseUrl } from "../db-url";

/**
 * Hosting platforms publish the connection string under names the app does not
 * choose. These cases are the ones actually seen in the wild, including the
 * prefixed variables a Vercel storage integration creates.
 */

const POOLED = "postgresql://user:pw@ep-example.neon.tech/neondb";
const DIRECT = "postgresql://user:pw@ep-example.neon.tech/neondb?unpooled=1";

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (/DATABASE_URL|POSTGRES|STORAGE_URL|DIRECT_URL/.test(key)) delete process.env[key];
  }
});

afterEach(() => {
  process.env = saved;
});

describe("connection string resolution", () => {
  it("uses a plain DATABASE_URL", () => {
    process.env.DATABASE_URL = POOLED;
    expect(pooledDatabaseUrl()).toBe(POOLED);
    expect(directDatabaseUrl()).toBe(POOLED); // only one URL available
  });

  it("finds a prefixed variable, as a Vercel storage integration creates", () => {
    process.env.bracketbuilder_DATABASE_URL = POOLED;
    expect(pooledDatabaseUrl()).toBe(POOLED);
  });

  it("prefers a direct URL for schema changes", () => {
    process.env.DATABASE_URL = POOLED;
    process.env.DATABASE_URL_UNPOOLED = DIRECT;
    expect(directDatabaseUrl()).toBe(DIRECT);
    // ...while requests keep using the pooled one.
    expect(pooledDatabaseUrl()).toBe(POOLED);
  });

  it("prefers a direct URL even when both are prefixed", () => {
    process.env.bracketbuilder_DATABASE_URL = POOLED;
    process.env.bracketbuilder_DATABASE_URL_UNPOOLED = DIRECT;
    expect(directDatabaseUrl()).toBe(DIRECT);
    expect(pooledDatabaseUrl()).toBe(POOLED);
  });

  it("treats a blank variable as absent rather than as configuration", () => {
    // This is the failure that looks configured and silently is not.
    process.env.DATABASE_URL = "";
    process.env.bracketbuilder_DATABASE_URL = POOLED;
    expect(pooledDatabaseUrl()).toBe(POOLED);
  });

  it("lets an exact name win over a prefixed one", () => {
    process.env.DATABASE_URL = POOLED;
    process.env.other_DATABASE_URL = "postgresql://wrong:pw@elsewhere/db";
    expect(pooledDatabaseUrl()).toBe(POOLED);
  });

  it("ignores nearby variables that are not Postgres URLs", () => {
    // Neon publishes an auth endpoint alongside the database variables.
    process.env.bracketbuilder_NEON_AUTH_URL = "https://auth.neon.tech/realms/prod";
    process.env.bracketbuilder_DATABASE_URL = POOLED;
    expect(pooledDatabaseUrl()).toBe(POOLED);
    expect(directDatabaseUrl()).toBe(POOLED);
  });

  it("returns nothing when there is genuinely no database configured", () => {
    expect(pooledDatabaseUrl()).toBeUndefined();
    expect(directDatabaseUrl()).toBeUndefined();
  });

  it("accepts both postgres:// and postgresql:// schemes", () => {
    process.env.STORAGE_URL = "postgres://user:pw@host/db";
    expect(pooledDatabaseUrl()).toBe("postgres://user:pw@host/db");
  });
});
