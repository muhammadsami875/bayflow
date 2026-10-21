import type { BookingStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { notFound } from "../errors";
import type { ShopAccess } from "../access";
import { computePartNeeds } from "../inventory";

const listInclude = {
  vehicle: true,
  customer: { select: { id: true, name: true, email: true, phone: true } },
  services: true,
  shop: { select: { id: true, name: true, city: true } },
} satisfies Prisma.BookingInclude;

const detailInclude = {
  ...listInclude,
  estimates: {
    orderBy: { version: "desc" },
    include: { lines: { include: { item: { select: { id: true, sku: true, name: true, quantity: true } } } } },
  },
  events: { orderBy: { createdAt: "asc" } },
  issues: { orderBy: { createdAt: "desc" } },
  orders: { include: { items: { include: { item: { select: { name: true, sku: true } } } } } },
  allocations: { include: { item: { select: { name: true, sku: true } } } },
} satisfies Prisma.BookingInclude;

/**
 * What each shop role is allowed to see. Technicians only their own jobs; QC the
 * shared queue plus what they picked; parts people the jobs assigned to them.
 */
function roleScope(access: ShopAccess): Prisma.BookingWhereInput {
  const me = access.user.id;
  switch (access.role) {
    case "OWNER":
    case "SERVICE_ADVISOR":
      return {};
    case "TECHNICIAN":
      return { technicianId: me };
    case "QC_INSPECTOR":
      return {
        OR: [
          { status: "QC_PENDING" },
          { qcInspectorId: me, status: { in: ["QC_IN_PROGRESS", "READY_FOR_PICKUP", "COMPLETED"] } },
        ],
      };
    case "PARTS_PERSON":
      return { partsPersonId: me };
  }
}

export async function listShopBookings(access: ShopAccess, statuses?: BookingStatus[]) {
  return db.booking.findMany({
    where: {
      shopId: access.shopId,
      AND: [roleScope(access), statuses?.length ? { status: { in: statuses } } : {}],
    },
    include: listInclude,
    orderBy: [{ slotDate: "asc" }, { slotTime: "asc" }],
    take: 300,
  });
}

async function names(ids: (string | null)[]) {
  const clean = ids.filter((i): i is string => !!i);
  const users = await db.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function getShopBooking(access: ShopAccess, bookingId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, shopId: access.shopId, AND: [roleScope(access)] },
    include: detailInclude,
  });
  if (!booking) throw notFound("Booking not found");

  const who = await names([booking.technicianId, booking.partsPersonId, booking.qcInspectorId]);
  const partNeeds = await computePartNeeds(db, access.shopId, booking.id);
  return {
    ...booking,
    technicianName: booking.technicianId ? who.get(booking.technicianId) ?? null : null,
    partsPersonName: booking.partsPersonId ? who.get(booking.partsPersonId) ?? null : null,
    qcInspectorName: booking.qcInspectorId ? who.get(booking.qcInspectorId) ?? null : null,
    partNeeds,
  };
}

export async function listCustomerBookings(customerId: string) {
  const rows = await db.booking.findMany({
    where: { customerId },
    include: {
      ...listInclude,
      estimates: { where: { status: "SENT" }, select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(({ estimates, ...b }) => ({ ...b, pendingEstimate: estimates.length > 0 }));
}

/** Customers never see internal data: draft estimates, QC issues, purchase orders, stock levels. */
export async function getCustomerBooking(customerId: string, bookingId: string) {
  const b = await db.booking.findFirst({
    where: { id: bookingId, customerId },
    include: detailInclude,
  });
  if (!b) throw notFound("Booking not found");
  const who = await names([b.technicianId]);
  return {
    id: b.id,
    ref: b.ref,
    status: b.status,
    slotDate: b.slotDate,
    slotTime: b.slotTime,
    notes: b.notes,
    readyNotifiedAt: b.readyNotifiedAt,
    cancelReason: b.cancelReason,
    createdAt: b.createdAt,
    shop: b.shop,
    vehicle: b.vehicle,
    services: b.services,
    technicianName: b.technicianId ? who.get(b.technicianId) ?? null : null,
    estimates: b.estimates
      .filter((e) => e.status !== "DRAFT")
      .map((e) => ({
        id: e.id,
        version: e.version,
        revision: e.revision,
        status: e.status,
        diagnosis: e.diagnosis,
        customerNote: e.customerNote,
        total: e.total,
        sentAt: e.sentAt,
        respondedAt: e.respondedAt,
        lines: e.lines.map((l) => ({
          id: l.id,
          kind: l.kind,
          description: l.description,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      })),
    events: b.events.map((e) => ({ id: e.id, toStatus: e.toStatus, createdAt: e.createdAt })),
  };
}
