import { db, type Tx } from "./db";
import { badRequest, conflict, notFound } from "./errors";
import { notifyShopRole, notifyUser } from "./notify";

export interface PartNeed {
  itemId: string;
  sku: string;
  name: string;
  unitCost: number;
  required: number;
  onHand: number;
  shortage: number;
}

type Client = Tx | typeof db;

/** The estimate that currently drives parts: the newest version that was sent to the customer. */
export async function latestSentEstimate(client: Client, bookingId: string) {
  return client.estimate.findFirst({
    where: { bookingId, status: { in: ["SENT", "APPROVED"] } },
    orderBy: { version: "desc" },
    include: { lines: true },
  });
}

/** Compares the approved estimate's part lines against live stock, per inventory item. */
export async function computePartNeeds(client: Client, shopId: string, bookingId: string) {
  const estimate = await latestSentEstimate(client, bookingId);
  if (!estimate) return [] as PartNeed[];

  const required = new Map<string, { qty: number; unitCost: number }>();
  for (const line of estimate.lines) {
    if (line.kind !== "PART" || !line.itemId) continue;
    const cur = required.get(line.itemId) ?? { qty: 0, unitCost: line.unitCost };
    cur.qty += line.quantity;
    required.set(line.itemId, cur);
  }
  if (required.size === 0) return [];

  const items = await client.inventoryItem.findMany({
    where: { shopId, id: { in: [...required.keys()] } },
  });
  return items.map<PartNeed>((it) => {
    const need = required.get(it.id)!;
    return {
      itemId: it.id,
      sku: it.sku,
      name: it.name,
      unitCost: it.cost || need.unitCost,
      required: need.qty,
      onHand: it.quantity,
      shortage: Math.max(0, need.qty - it.quantity),
    };
  });
}

async function nextPoNumber(tx: Tx, shopId: string) {
  const count = await tx.purchaseOrder.count({ where: { shopId } });
  return `PO-${String(count + 1).padStart(4, "0")}`;
}

export async function createPurchaseOrder(
  tx: Tx,
  input: {
    shopId: string;
    createdById: string;
    bookingId?: string;
    supplier?: string;
    items: { itemId: string; quantity: number; unitCost: number }[];
  },
) {
  const ids = [...new Set(input.items.map((i) => i.itemId))];
  const found = await tx.inventoryItem.count({ where: { shopId: input.shopId, id: { in: ids } } });
  if (found !== ids.length) throw badRequest("One or more items do not belong to this shop");

  if (input.bookingId) {
    const b = await tx.booking.findFirst({
      where: { id: input.bookingId, shopId: input.shopId },
      select: { id: true },
    });
    if (!b) throw notFound("Booking not found");
  }

  return tx.purchaseOrder.create({
    data: {
      shopId: input.shopId,
      bookingId: input.bookingId,
      supplier: input.supplier,
      createdById: input.createdById,
      number: await nextPoNumber(tx, input.shopId),
      items: {
        create: input.items.map((i) => ({
          itemId: i.itemId,
          quantityOrdered: i.quantity,
          unitCost: i.unitCost,
        })),
      },
    },
    include: { items: true },
  });
}

/**
 * Receiving stock. Partial deliveries are supported: the PO stays PARTIALLY_RECEIVED
 * and linked bookings stay in PARTS_ORDERED until nothing is short any more.
 */
export async function receivePurchaseOrder(
  tx: Tx,
  shopId: string,
  poId: string,
  receipts: { poItemId: string; quantity: number }[],
  actor: { userId: string; name: string },
) {
  const po = await tx.purchaseOrder.findFirst({
    where: { id: poId, shopId },
    include: { items: true },
  });
  if (!po) throw notFound("Purchase order not found");
  if (po.status === "RECEIVED") throw conflict("This purchase order is already fully received");

  for (const r of receipts) {
    const line = po.items.find((i) => i.id === r.poItemId);
    if (!line) throw badRequest("Item does not belong to this purchase order");
    const remaining = line.quantityOrdered - line.quantityReceived;
    if (r.quantity > remaining) throw badRequest(`Only ${remaining} left to receive for one of the items`);

    await tx.purchaseOrderItem.update({
      where: { id: line.id },
      data: { quantityReceived: { increment: r.quantity } },
    });
    await tx.inventoryItem.update({
      where: { id: line.itemId },
      data: { quantity: { increment: r.quantity } },
    });
  }

  const fresh = await tx.purchaseOrderItem.findMany({ where: { orderId: po.id } });
  const allDone = fresh.every((i) => i.quantityReceived >= i.quantityOrdered);
  const anyDone = fresh.some((i) => i.quantityReceived > 0);
  const status = allDone ? "RECEIVED" : anyDone ? "PARTIALLY_RECEIVED" : "ORDERED";
  await tx.purchaseOrder.update({ where: { id: po.id }, data: { status } });

  await promoteBookingsWithStock(tx, shopId, actor);
  return status;
}

/** Any booking waiting in PARTS_ORDERED whose shortages are now covered moves to PARTS_READY. */
async function promoteBookingsWithStock(
  tx: Tx,
  shopId: string,
  actor: { userId: string; name: string },
) {
  const waiting = await tx.booking.findMany({
    where: { shopId, status: "PARTS_ORDERED" },
    select: { id: true, ref: true, technicianId: true, partsPersonId: true },
  });
  for (const b of waiting) {
    const needs = await computePartNeeds(tx, shopId, b.id);
    if (needs.some((n) => n.shortage > 0)) continue;
    const res = await tx.booking.updateMany({
      where: { id: b.id, status: "PARTS_ORDERED" },
      data: { status: "PARTS_READY" },
    });
    if (res.count === 0) continue;
    await tx.bookingEvent.create({
      data: {
        bookingId: b.id,
        actorId: actor.userId,
        actorName: actor.name,
        actorRole: "Parts Person",
        action: "RECEIVE_PARTS",
        fromStatus: "PARTS_ORDERED",
        toStatus: "PARTS_READY",
        note: "All ordered parts received",
      },
    });
    const msg = { title: "Parts ready", body: `All parts for ${b.ref} have arrived.`, shopId, bookingId: b.id };
    await notifyUser(tx, b.technicianId, msg);
    await notifyUser(tx, b.partsPersonId, msg);
    await notifyShopRole(tx, shopId, "SERVICE_ADVISOR", { title: msg.title, body: msg.body, bookingId: b.id });
  }
}
