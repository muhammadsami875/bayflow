import { db } from "@/server/db";
import { route, readJson, notFound, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { serviceSchema } from "@/lib/validators";

export const PATCH = route<Ctx<"shopId" | "serviceId">>(async (req, { params }) => {
  const { shopId, serviceId } = await params;
  const access = await requireShopAccess(shopId, ["OWNER"]);
  const input = serviceSchema.partial().parse(await readJson(req));
  const res = await db.service.updateMany({
    where: { id: serviceId, shopId: access.shopId },
    data: input,
  });
  if (res.count === 0) throw notFound("Service not found");
  return { ok: true };
});
