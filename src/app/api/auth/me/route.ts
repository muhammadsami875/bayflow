import { db } from "@/server/db";
import { route } from "@/server/errors";
import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Returns the signed-in user plus the shops they can open in the POS (owned or member of). */
export const GET = route(async () => {
  const user = await getSessionUser();
  if (!user) return { user: null, shops: [] };
  if (user.type === "CUSTOMER") return { user, shops: [] };

  const [owned, memberships] = await Promise.all([
    db.shop.findMany({
      where: { ownerId: user.id },
      select: { id: true, name: true, city: true, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    db.membership.findMany({
      where: { userId: user.id, isActive: true },
      select: { role: true, shop: { select: { id: true, name: true, city: true, isActive: true } } },
    }),
  ]);
  const shops = [
    ...owned.map((s) => ({ ...s, role: "OWNER" as const })),
    ...memberships.map((m) => ({ ...m.shop, role: m.role })),
  ];
  return { user, shops };
});
