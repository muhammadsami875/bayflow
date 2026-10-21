import { route, readJson } from "@/server/errors";
import { getSessionUser, startSession } from "@/server/auth";
import { createBooking } from "@/server/bookings/create";
import { createBookingSchema } from "@/lib/validators";

/** Booking wizard submit: creates the booking and, if needed, the customer account. */
export const POST = route(async (req) => {
  const input = createBookingSchema.parse(await readJson(req));
  const session = await getSessionUser();
  const result = await createBooking(input, session);
  if (!session) await startSession(result.customerId, result.customerType);
  return {
    booking: { id: result.booking.id, ref: result.booking.ref, status: result.booking.status },
    isNewAccount: result.isNewAccount,
  };
});
