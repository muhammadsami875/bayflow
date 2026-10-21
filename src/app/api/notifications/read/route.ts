import { z } from "zod";
import { db } from "@/server/db";
import { route, readJson } from "@/server/errors";
import { requireUser } from "@/server/auth";

const schema = z.object({ ids: z.array(z.string()).optional() });

/** Marks the given notifications (or all, when no ids are sent) as read. Scoped to the caller. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { ids } = schema.parse(await readJson(req).catch(() => ({})));
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return { ok: true };
});
