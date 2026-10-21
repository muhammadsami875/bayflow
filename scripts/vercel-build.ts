/**
 * Vercel build: apply migrations, seed an empty database once, then build the app.
 * Resolves integration-style variable names first (see src/server/db-url.ts).
 */
import { execSync } from "node:child_process";
import { applyDatabaseEnv } from "../src/server/db-url";

applyDatabaseEnv();

if (!process.env.DATABASE_URL) {
  console.error(
    "No database URL found. Set DATABASE_URL (or connect a database integration that sets POSTGRES_PRISMA_URL).",
  );
  process.exit(1);
}

const run = (cmd: string) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: process.env });
};

run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts --if-empty");
run("npx prisma generate");
run("npx next build");
