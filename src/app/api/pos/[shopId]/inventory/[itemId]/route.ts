import { db } from "@/server/db";
import { route, readJson, notFound, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { inventorySchema } from "@/lib/validators";

export const PATCH = route<Ctx<"shopId" | "itemId">>(async (req, { params }) => {
  const { shopId, itemId } = await params;
  const access = await requireShopAccess(shopId, ["PARTS_PERSON", "OWNER"]);
  const input = inventorySchema.partial().parse(await readJson(req));
  const res = await db.inventoryItem.updateMany({
    where: { id: itemId, shopId: access.shopId },
    data: input,
  });
  if (res.count === 0) throw notFound("Item not found");
  return { ok: true };
});
