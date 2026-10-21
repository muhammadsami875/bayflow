import { db } from "@/server/db";
import { route } from "@/server/errors";
import { listPublicShops } from "@/server/shops";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const shops = await listPublicShops({
    city: url.searchParams.get("city") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const cities = await db.shop.findMany({
    where: { isActive: true },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  return { shops, cities: cities.map((c) => c.city) };
});
