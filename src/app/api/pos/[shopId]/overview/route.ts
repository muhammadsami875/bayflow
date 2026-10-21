import { db } from "@/server/db";
import { route, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";

export const dynamic = "force-dynamic";

export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["OWNER"]);
  const shopId = access.shopId;

  const [byStatus, team, inventory, openOrders] = await Promise.all([
    db.booking.groupBy({ by: ["status"], where: { shopId }, _count: { _all: true } }),
    db.membership.findMany({
      where: { shopId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.inventoryItem.findMany({ where: { shopId }, select: { quantity: true, reorderLevel: true, cost: true } }),
    db.purchaseOrder.count({ where: { shopId, status: { not: "RECEIVED" } } }),
  ]);

  return {
    bookingsByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
    team: team.map((m) => ({
      id: m.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      isActive: m.isActive,
    })),
    inventory: {
      items: inventory.length,
      lowStock: inventory.filter((i) => i.quantity <= i.reorderLevel).length,
      value: inventory.reduce((s, i) => s + i.quantity * i.cost, 0),
    },
    openOrders,
  };
});
