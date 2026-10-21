import { db, type Tx } from "./db";
import { conflict, notFound } from "./errors";

export interface SlotView {
  time: string;
  remaining: number;
  available: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

/** "Now" expressed in the shop's local wall-clock time. */
export function shopNow(utcOffsetMinutes: number): { date: string; minutes: number } {
  const d = new Date(Date.now() + utcOffsetMinutes * 60_000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

interface SlotShop {
  openTime: string;
  closeTime: string;
  workingDays: number[];
  slotMinutes: number;
  slotCapacity: number;
  utcOffsetMinutes: number;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function generateTimes(shop: SlotShop, date: string): string[] {
  if (!shop.workingDays.includes(weekdayOf(date))) return [];
  const out: string[] = [];
  const end = toMin(shop.closeTime);
  for (let m = toMin(shop.openTime); m + shop.slotMinutes <= end; m += shop.slotMinutes) {
    out.push(fromMin(m));
  }
  return out;
}

export async function getAvailability(shopId: string, date: string): Promise<SlotView[]> {
  const shop = await db.shop.findFirst({ where: { id: shopId, isActive: true } });
  if (!shop) throw notFound("Shop not found");

  const now = shopNow(shop.utcOffsetMinutes);
  if (date < now.date) return [];

  const booked = await db.slot.findMany({ where: { shopId, date } });
  const bookedByTime = new Map(booked.map((s) => [s.time, s.booked]));

  return generateTimes(shop, date).map((time) => {
    const isPast = date === now.date && toMin(time) <= now.minutes;
    const remaining = Math.max(0, shop.slotCapacity - (bookedByTime.get(time) ?? 0));
    return { time, remaining, available: !isPast && remaining > 0 };
  });
}

/**
 * Atomically takes one unit of capacity. The guarded UPDATE (`booked < capacity`)
 * makes double-booking impossible even under concurrent requests.
 */
export async function reserveSlot(tx: Tx, shopId: string, date: string, time: string) {
  const shop = await tx.shop.findFirst({ where: { id: shopId, isActive: true } });
  if (!shop) throw notFound("Shop not found");

  if (!generateTimes(shop, date).includes(time)) {
    throw conflict("That time is not offered by this shop");
  }
  const now = shopNow(shop.utcOffsetMinutes);
  if (date < now.date || (date === now.date && toMin(time) <= now.minutes)) {
    throw conflict("That time has already passed");
  }

  await tx.slot.upsert({
    where: { shopId_date_time: { shopId, date, time } },
    create: { shopId, date, time, booked: 0 },
    update: {},
  });
  const res = await tx.slot.updateMany({
    where: { shopId, date, time, booked: { lt: shop.slotCapacity } },
    data: { booked: { increment: 1 } },
  });
  if (res.count === 0) throw conflict("That slot was just taken. Please pick another time.");
}

export async function releaseSlot(tx: Tx, shopId: string, date: string, time: string) {
  await tx.slot.updateMany({
    where: { shopId, date, time, booked: { gt: 0 } },
    data: { booked: { decrement: 1 } },
  });
}
