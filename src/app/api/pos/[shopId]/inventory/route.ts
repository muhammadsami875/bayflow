import { db } from "@/server/db";
import { route, readJson, conflict, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { inventorySchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Any staff role can read stock (technicians pick parts from it); only parts person / owner edit it. */
export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const access = await requireShopAccess((await params).shopId);
  const items = await db.inventoryItem.findMany({
    where: { shopId: access.shopId },
    orderBy: { name: "asc" },
  });
  return { items };
});

export const POST = route<Ctx<"shopId">>(async (req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["PARTS_PERSON", "OWNER"]);
  const input = inventorySchema.parse(await readJson(req));
  const dup = await db.inventoryItem.findUnique({
    where: { shopId_sku: { shopId: access.shopId, sku: input.sku } },
  });
  if (dup) throw conflict(`SKU ${input.sku} already exists in this shop`);
  const item = await db.inventoryItem.create({ data: { ...input, shopId: access.shopId } });
  return { item };
});
