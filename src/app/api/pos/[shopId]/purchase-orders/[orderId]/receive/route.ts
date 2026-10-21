import { db } from "@/server/db";
import { route, readJson, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { receivePurchaseOrder } from "@/server/inventory";
import { receiveSchema } from "@/lib/validators";

/** Confirms receipt (full or partial). Stock goes up; bookings waiting on parts advance automatically. */
export const POST = route<Ctx<"shopId" | "orderId">>(async (req, { params }) => {
  const { shopId, orderId } = await params;
  const access = await requireShopAccess(shopId, ["PARTS_PERSON", "OWNER"]);
  const input = receiveSchema.parse(await readJson(req));
  const status = await db.$transaction(
    (tx) =>
      receivePurchaseOrder(tx, access.shopId, orderId, input.items, {
        userId: access.user.id,
        name: access.user.name,
      }),
    { timeout: 20_000 },
  );
  return { status };
});
