import { route, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { getShopBooking } from "@/server/bookings/queries";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId" | "id">>(async (_req, { params }) => {
  const { shopId, id } = await params;
  const access = await requireShopAccess(shopId);
  return { booking: await getShopBooking(access, id), role: access.role };
});
