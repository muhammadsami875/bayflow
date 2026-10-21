import { route, type Ctx } from "@/server/errors";
import { requireCustomer } from "@/server/auth";
import { getCustomerBooking } from "@/server/bookings/queries";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"id">>(async (_req, { params }) => {
  const user = await requireCustomer();
  const { id } = await params;
  return { booking: await getCustomerBooking(user.id, id) };
});
