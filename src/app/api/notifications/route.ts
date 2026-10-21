import { db } from "@/server/db";
import { route } from "@/server/errors";
import { requireUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { items, unread };
});
