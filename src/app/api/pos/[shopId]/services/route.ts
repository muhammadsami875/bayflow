import { db } from "@/server/db";
import { route, readJson, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { serviceSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const access = await requireShopAccess((await params).shopId);
  const services = await db.service.findMany({
    where: { shopId: access.shopId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return { services };
});

export const POST = route<Ctx<"shopId">>(async (req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["OWNER"]);
  const input = serviceSchema.parse(await readJson(req));
  const service = await db.service.create({ data: { ...input, shopId: access.shopId } });
  return { service };
});
