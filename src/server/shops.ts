import { db } from "./db";
import { notFound } from "./errors";

const publicShopSelect = {
  id: true,
  name: true,
  description: true,
  address: true,
  city: true,
  phone: true,
  openTime: true,
  closeTime: true,
  workingDays: true,
  slotMinutes: true,
  logoUrl: true,
  services: {
    where: { isActive: true },
    select: { id: true, name: true, description: true, durationMin: true, basePrice: true },
    orderBy: { name: "asc" as const },
  },
} as const;

export async function listPublicShops(filter: { city?: string; q?: string }) {
  return db.shop.findMany({
    where: {
      isActive: true,
      ...(filter.city ? { city: { equals: filter.city, mode: "insensitive" } } : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: "insensitive" } },
              { city: { contains: filter.q, mode: "insensitive" } },
              { services: { some: { name: { contains: filter.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    select: publicShopSelect,
    orderBy: { name: "asc" },
  });
}

export async function getPublicShop(id: string) {
  const shop = await db.shop.findFirst({ where: { id, isActive: true }, select: publicShopSelect });
  if (!shop) throw notFound("Shop not found");
  return shop;
}
