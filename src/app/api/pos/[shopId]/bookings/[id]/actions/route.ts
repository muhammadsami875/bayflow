import { route, readJson, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { performAction } from "@/server/bookings/actions";
import { actionSchema } from "@/lib/validators";

/**
 * Every shop-side status change goes through here. Tenant scope comes from requireShopAccess;
 * the state machine inside performAction enforces role + current-status + assignment rules.
 */
export const POST = route<Ctx<"shopId" | "id">>(async (req, { params }) => {
  const { shopId, id } = await params;
  const access = await requireShopAccess(shopId);
  const input = actionSchema.parse(await readJson(req));
  return performAction(
    { userId: access.user.id, name: access.user.name, role: access.role, shopId: access.shopId },
    id,
    input,
  );
});
