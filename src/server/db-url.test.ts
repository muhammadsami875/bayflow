import { describe, expect, it } from "vitest";
import { applyDatabaseEnv } from "./db-url";

const apply = (vars: Record<string, string>) => {
  const env = { ...vars } as NodeJS.ProcessEnv;
  applyDatabaseEnv(env);
  return env;
};

describe("applyDatabaseEnv", () => {
  it("maps Supabase integration variables and adds pgbouncer for the pooled port", () => {
    const env = apply({
      POSTGRES_PRISMA_URL: "postgres://u:p@aws-0-eu.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
      POSTGRES_URL_NON_POOLING: "postgres://u:p@aws-0-eu.pooler.supabase.com:5432/postgres?sslmode=require",
    });
    expect(env.DATABASE_URL).toContain(":6543");
    expect(env.DATABASE_URL).toContain("pgbouncer=true");
    expect(env.DATABASE_URL).not.toContain("supa=");
    expect(env.DIRECT_URL).toContain(":5432");
  });

  it("never overrides explicit DATABASE_URL and DIRECT_URL", () => {
    const env = apply({
      DATABASE_URL: "postgres://a:b@host/db",
      DIRECT_URL: "postgres://a:b@direct/db",
      POSTGRES_PRISMA_URL: "postgres://other",
    });
    expect(env.DATABASE_URL).toBe("postgres://a:b@host/db");
    expect(env.DIRECT_URL).toBe("postgres://a:b@direct/db");
  });

  it("falls back DIRECT_URL to DATABASE_URL and tolerates no database at all", () => {
    expect(apply({ DATABASE_URL: "postgres://a:b@host/db" }).DIRECT_URL).toBe("postgres://a:b@host/db");
    expect(apply({}).DATABASE_URL).toBeUndefined();
  });
});
