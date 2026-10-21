import { route, readJson, type Ctx } from "@/server/errors";
import { requireCustomer } from "@/server/auth";
import { performAction } from "@/server/bookings/actions";
import { actionSchema } from "@/lib/validators";

/** Customer actions: approve/reject estimate, cancel, confirm pick-up. Role + state are enforced in performAction. */
export const POST = route<Ctx<"id">>(async (req, { params }) => {
  const user = await requireCustomer();
  const { id } = await params;
  const input = actionSchema.parse(await readJson(req));
  return performAction({ userId: user.id, name: user.name, role: "CUSTOMER" }, id, input);
});
