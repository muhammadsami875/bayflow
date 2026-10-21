import { route, type Ctx } from "@/server/errors";
import { getAvailability } from "@/server/slots";
import { dateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId">>(async (req, { params }) => {
  const { shopId } = await params;
  const date = dateSchema.parse(new URL(req.url).searchParams.get("date") ?? "");
  return { date, slots: await getAvailability(shopId, date) };
});
