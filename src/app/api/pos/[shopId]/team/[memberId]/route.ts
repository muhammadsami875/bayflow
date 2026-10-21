import { db } from "@/server/db";
import { route, readJson, notFound, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { teamUpdateSchema } from "@/lib/validators";

export const PATCH = route<Ctx<"shopId" | "memberId">>(async (req, { params }) => {
  const { shopId, memberId } = await params;
  const access = await requireShopAccess(shopId, ["OWNER"]);
  const input = teamUpdateSchema.parse(await readJson(req));

  // Scoped by shopId: an owner can't touch memberships of someone else's shop by guessing ids.
  const res = await db.membership.updateMany({
    where: { id: memberId, shopId: access.shopId },
    data: input,
  });
  if (res.count === 0) throw notFound("Team member not found");
  return { ok: true };
});
