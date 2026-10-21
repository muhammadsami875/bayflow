import { route } from "@/server/errors";
import { endSession } from "@/server/auth";

export const POST = route(async () => {
  await endSession();
  return { ok: true };
});
