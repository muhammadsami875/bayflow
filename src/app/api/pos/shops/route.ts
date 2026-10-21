import { db } from "@/server/db";
import { route, readJson, forbidden } from "@/server/errors";
import { requireUser } from "@/server/auth";
import { shopCreateSchema } from "@/lib/validators";

/** Owners create additional shops at any time; each is its own tenant with its own team. */
export const POST = route(async (req) => {
  const user = await requireUser();
  if (user.type !== "OWNER") throw forbidden("Only owners can create shops");
  const input = shopCreateSchema.parse(await readJson(req));
  const shop = await db.shop.create({ data: { ...input, ownerId: user.id } });
  return { shop: { id: shop.id, name: shop.name } };
});
