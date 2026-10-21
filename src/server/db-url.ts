/**
 * Maps the variable names that Vercel's database integrations create (Supabase, Neon, Vercel Postgres)
 * onto the two names the Prisma schema reads: DATABASE_URL (pooled, used by the app) and
 * DIRECT_URL (non-pooled, used by migrations). Explicit DATABASE_URL / DIRECT_URL always win.
 */
export function applyDatabaseEnv(env: NodeJS.ProcessEnv = process.env) {
  env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || env.DATABASE_URL_UNPOOLED;
  env.DIRECT_URL ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;

  const url = env.DATABASE_URL;
  if (!url) return;
  try {
    const u = new URL(url);
    // Prisma does not understand Supabase's `supa=` marker parameter.
    u.searchParams.delete("supa");
    // Transaction-mode poolers (Supabase :6543, Neon -pooler) need this to avoid prepared-statement errors.
    const pooled = u.port === "6543" || u.hostname.includes("-pooler");
    if (pooled && !u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    env.DATABASE_URL = u.toString();
  } catch {
    // Leave a malformed URL untouched so Prisma reports the real error.
  }
}
