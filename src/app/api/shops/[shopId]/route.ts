import { route, type Ctx } from "@/server/errors";
import { getPublicShop } from "@/server/shops";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const { shopId } = await params;
  return { shop: await getPublicShop(shopId) };
});
