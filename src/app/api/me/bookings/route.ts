import { route } from "@/server/errors";
import { requireCustomer } from "@/server/auth";
import { listCustomerBookings } from "@/server/bookings/queries";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireCustomer();
  return { bookings: await listCustomerBookings(user.id) };
});
