import { db } from "@/server/db";
import { route, readJson, conflict } from "@/server/errors";
import { hashPassword, startSession } from "@/server/auth";
import { ownerSignupSchema } from "@/lib/validators";

/** Self sign-up is for shop owners only. Staff are created by owners, customers by booking. */
export const POST = route(async (req) => {
  const input = ownerSignupSchema.parse(await readJson(req));
  if (await db.user.findUnique({ where: { email: input.email } })) {
    throw conflict("An account with this email already exists");
  }
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      type: "OWNER",
      passwordHash: await hashPassword(input.password),
    },
  });
  await startSession(user.id, user.type);
  return { user: { id: user.id, name: user.name, email: user.email, type: user.type } };
});
