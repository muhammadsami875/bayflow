import { db } from "@/server/db";
import { route, readJson, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { createPurchaseOrder } from "@/server/inventory";
import { purchaseOrderSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["PARTS_PERSON", "OWNER"]);
  const orders = await db.purchaseOrder.findMany({
    where: { shopId: access.shopId },
    include: {
      items: { include: { item: { select: { name: true, sku: true } } } },
      booking: { select: { ref: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { orders };
});

/** Stand-alone restock order (booking-linked orders are created via the ORDER_PARTS action). */
export const POST = route<Ctx<"shopId">>(async (req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["PARTS_PERSON", "OWNER"]);
  const input = purchaseOrderSchema.parse(await readJson(req));
  const order = await db.$transaction((tx) =>
    createPurchaseOrder(tx, {
      shopId: access.shopId,
      createdById: access.user.id,
      supplier: input.supplier,
      items: input.items,
    }),
  );
  return { order };
});
