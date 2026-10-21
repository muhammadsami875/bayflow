import { db, type Tx } from "./db";

interface NotifyInput {
  title: string;
  body: string;
  shopId?: string;
  bookingId?: string;
}

type Client = Tx | typeof db;

export async function notifyUser(
  client: Client,
  userId: string | null | undefined,
  n: NotifyInput,
) {
  if (!userId) return;
  await client.notification.create({ data: { userId, ...n } });
}

/** Notify every active staff member of a role in a shop. Service Advisor alerts also reach the owner. */
export async function notifyShopRole(
  client: Client,
  shopId: string,
  role: "SERVICE_ADVISOR" | "TECHNICIAN" | "QC_INSPECTOR" | "PARTS_PERSON",
  n: Omit<NotifyInput, "shopId">,
) {
  const members = await client.membership.findMany({
    where: { shopId, role, isActive: true },
    select: { userId: true },
  });
  const ids = new Set(members.map((m) => m.userId));
  if (role === "SERVICE_ADVISOR") {
    const shop = await client.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
    if (shop) ids.add(shop.ownerId);
  }
  if (ids.size === 0) return;
  await client.notification.createMany({
    data: [...ids].map((userId) => ({ userId, shopId, ...n })),
  });
}
