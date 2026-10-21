import { db } from "@/server/db";
import { route, readJson, unauthorized } from "@/server/errors";
import { startSession, verifyPassword } from "@/server/auth";
import { loginSchema } from "@/lib/validators";

export const POST = route(async (req) => {
  const { email, password } = loginSchema.parse(await readJson(req));
  const user = await db.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password: no account enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Incorrect email or password");
  }
  await startSession(user.id, user.type);
  return { user: { id: user.id, name: user.name, email: user.email, type: user.type } };
});
