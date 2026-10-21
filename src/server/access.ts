import type { ShopRole } from "@prisma/client";
import { db } from "./db";
import { forbidden, notFound } from "./errors";
import { requireUser, type SessionUser } from "./auth";
import { roleMatches, type ActorRole } from "@/lib/state-machine";

export interface ShopAccess {
  user: SessionUser;
  shopId: string;
  /** OWNER if the user owns the shop, otherwise their membership role. */
  role: Exclude<ActorRole, "CUSTOMER">;
}

/**
 * Tenant isolation lives here. Every /api/pos/[shopId]/* handler calls this first;
 * a user with no ownership or active membership for that shop gets a 404, so shop
 * ids cannot even be probed. All later queries are additionally scoped by shopId.
 */
export async function requireShopAccess(
  shopId: string,
  allowed?: readonly ActorRole[],
): Promise<ShopAccess> {
  const user = await requireUser();
  if (user.type === "CUSTOMER") throw forbidden("Customers cannot use the shop dashboard");

  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
  if (!shop) throw notFound("Shop not found");

  let role: ShopAccess["role"] | null = null;
  if (shop.ownerId === user.id) {
    role = "OWNER";
  } else {
    const m = await db.membership.findUnique({
      where: { shopId_userId: { shopId, userId: user.id } },
      select: { role: true, isActive: true },
    });
    if (m?.isActive) role = m.role;
  }
  if (!role) throw notFound("Shop not found");

  if (allowed && !roleMatches(role, allowed)) throw forbidden();
  return { user, shopId, role };
}

export const isOwner = (a: ShopAccess) => a.role === "OWNER";
export type { ShopRole };
