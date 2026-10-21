import { route, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { listShopBookings } from "@/server/bookings/queries";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/state-machine";

export const dynamic = "force-dynamic";

/** Role-scoped list: the role decides which bookings you may see, the query string only narrows them. */
export const GET = route<Ctx<"shopId">>(async (req, { params }) => {
  const access = await requireShopAccess((await params).shopId);
  const status = new URL(req.url).searchParams.get("status");
  const statuses = status
    ?.split(",")
    .filter((s): s is BookingStatus => (BOOKING_STATUSES as readonly string[]).includes(s));
  return { bookings: await listShopBookings(access, statuses), role: access.role };
});
