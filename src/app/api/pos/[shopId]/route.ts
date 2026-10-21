import { db } from "@/server/db";
import { route, readJson, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { shopUpdateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const access = await requireShopAccess((await params).shopId);
  const shop = await db.shop.findUniqueOrThrow({ where: { id: access.shopId } });
  return { shop, role: access.role, user: access.user };
});

export const PATCH = route<Ctx<"shopId">>(async (req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["OWNER"]);
  const input = shopUpdateSchema.parse(await readJson(req));
  const shop = await db.shop.update({ where: { id: access.shopId }, data: input });
  return { shop };
});
