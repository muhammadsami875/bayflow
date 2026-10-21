import type { BookingStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { notifyShopRole, notifyUser } from "../notify";
import { releaseSlot } from "../slots";
import { computePartNeeds, createPurchaseOrder } from "../inventory";
import { checkTransition, type ActorRole } from "@/lib/state-machine";
import { ROLE_LABEL, STATUS_META } from "@/lib/constants";
import type { ActionInput, EstimateLineInput } from "@/lib/validators";

export interface Actor {
  userId: string;
  name: string;
  role: ActorRole;
  /** Required for every non-customer actor: all booking access is scoped to this shop. */
  shopId?: string;
}

type LoadedBooking = Awaited<ReturnType<typeof loadBooking>>;

async function loadBooking(tx: Tx | typeof db, actor: Actor, bookingId: string) {
  const where: Prisma.BookingWhereInput =
    actor.role === "CUSTOMER"
      ? { id: bookingId, customerId: actor.userId }
      : { id: bookingId, shopId: actor.shopId ?? "__none__" };
  const booking = await tx.booking.findFirst({
    where,
    include: { vehicle: true, customer: { select: { id: true, name: true } } },
  });
  if (!booking) throw notFound("Booking not found");
  return booking;
}

/** Checks that need the booking row: the job must be assigned to *this* person. */
function assertAssignment(action: ActionInput["action"], booking: LoadedBooking, actor: Actor) {
  const needsTechnician = ["START_INSPECTION", "SAVE_ESTIMATE", "SUBMIT_ESTIMATE", "SEND_TO_QC"];
  const needsParts = ["ORDER_PARTS", "MARK_PARTS_READY", "ALLOCATE_PARTS"];
  const needsQc = ["QC_PASS", "QC_FAIL"];

  if (needsTechnician.includes(action) && booking.technicianId !== actor.userId) {
    throw forbidden("This job is assigned to another technician");
  }
  if (needsParts.includes(action) && booking.partsPersonId !== actor.userId) {
    throw forbidden("This job is assigned to another parts person");
  }
  if (needsQc.includes(action) && booking.qcInspectorId !== actor.userId) {
    throw forbidden("Another inspector picked this job");
  }
  if (action === "COMPLETE" && actor.role === "CUSTOMER" && !booking.readyNotifiedAt) {
    throw conflict("The shop has not told you the vehicle is ready yet");
  }
}

export async function performAction(actor: Actor, bookingId: string, input: ActionInput) {
  const action = input.action;

  return db.$transaction(
    async (tx) => {
      const booking = await loadBooking(tx, actor, bookingId);

      const check = checkTransition(action, booking.status, actor.role);
      if (!check.ok) {
        if (check.reason === "ROLE") {
          throw forbidden(`${ROLE_LABEL[actor.role]}s cannot perform this action`);
        }
        throw conflict(
          `This can't be done while the booking is "${STATUS_META[booking.status].label}"`,
        );
      }
      assertAssignment(action, booking, actor);

      const patch: Prisma.BookingUncheckedUpdateManyInput = {};
      const ctx = { tx, actor, booking };
      let note: string | undefined;

      switch (input.action) {
        case "CONFIRM":
          await notifyUser(tx, booking.customerId, {
            title: "Booking confirmed",
            body: `Your booking ${booking.ref} has been confirmed.`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;

        case "DECLINE":
        case "CANCEL":
          note = input.note;
          await cancelBooking(ctx, input.note, input.action === "DECLINE");
          patch.cancelReason = input.note ?? null;
          break;

        case "ASSIGN_TECHNICIAN": {
          await assertStaff(tx, booking.shopId, input.technicianId, "TECHNICIAN");
          patch.technicianId = input.technicianId;
          await notifyUser(tx, input.technicianId, {
            title: "New job assigned",
            body: `${booking.ref}: ${booking.vehicle.make} ${booking.vehicle.model} (${booking.vehicle.regNo})`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;
        }

        case "START_INSPECTION": {
          const existing = await tx.estimate.findFirst({ where: { bookingId: booking.id } });
          if (!existing) {
            await tx.estimate.create({ data: { bookingId: booking.id, createdById: actor.userId } });
          }
          break;
        }

        case "SAVE_ESTIMATE":
          await writeEstimate(ctx, input.lines, input.diagnosis, false);
          break;

        case "SUBMIT_ESTIMATE":
          await writeEstimate(ctx, input.lines, input.diagnosis, false);
          await notifyShopRole(tx, booking.shopId, "SERVICE_ADVISOR", {
            title: "Estimate submitted",
            body: `${booking.ref} is ready for your review.`,
            bookingId: booking.id,
          });
          break;

        case "EDIT_ESTIMATE":
          await writeEstimate(ctx, input.lines, input.diagnosis, true);
          break;

        case "SEND_ESTIMATE": {
          const est = await currentEstimate(tx, booking.id);
          if (!est || est.status !== "DRAFT") throw conflict("There is no estimate ready to send");
          if (est.total <= 0) throw badRequest("The estimate total must be greater than zero");
          await tx.estimate.update({
            where: { id: est.id },
            data: { status: "SENT", sentAt: new Date() },
          });
          await notifyUser(tx, booking.customerId, {
            title: "Estimate ready for approval",
            body: `Your estimate for ${booking.ref} is waiting for your approval.`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;
        }

        case "APPROVE_ESTIMATE":
        case "REJECT_ESTIMATE": {
          const est = await currentEstimate(tx, booking.id);
          if (!est || est.status !== "SENT") throw conflict("There is no estimate awaiting a response");
          const approved = input.action === "APPROVE_ESTIMATE";
          note = approved ? undefined : input.note;
          await tx.estimate.update({
            where: { id: est.id },
            data: {
              status: approved ? "APPROVED" : "REJECTED",
              respondedAt: new Date(),
              customerNote: approved ? null : (input.note ?? null),
            },
          });
          await notifyShopRole(tx, booking.shopId, "SERVICE_ADVISOR", {
            title: approved ? "Estimate approved" : "Estimate rejected",
            body: approved
              ? `${booking.customer.name} approved the estimate for ${booking.ref}. Assign a parts person.`
              : `${booking.customer.name} rejected the estimate for ${booking.ref}.`,
            bookingId: booking.id,
          });
          break;
        }

        case "REQUEST_REVISION": {
          note = input.note;
          const est = await currentEstimate(tx, booking.id);
          if (!est) throw conflict("No estimate to revise");
          await tx.estimate.create({
            data: {
              bookingId: booking.id,
              version: est.version + 1,
              createdById: actor.userId,
              diagnosis: est.diagnosis,
              total: est.total,
              lines: {
                create: est.lines.map((l) => ({
                  kind: l.kind,
                  description: l.description,
                  itemId: l.itemId,
                  quantity: l.quantity,
                  unitCost: l.unitCost,
                })),
              },
            },
          });
          await notifyUser(tx, booking.technicianId, {
            title: "Estimate needs revision",
            body: `${booking.ref}: customer rejected the estimate.${input.note ? ` Note: ${input.note}` : ""}`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;
        }

        case "ASSIGN_PARTS_PERSON":
          await assertStaff(tx, booking.shopId, input.partsPersonId, "PARTS_PERSON");
          patch.partsPersonId = input.partsPersonId;
          await notifyUser(tx, input.partsPersonId, {
            title: "Parts needed",
            body: `${booking.ref} was approved. Check stock against the estimate.`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;

        case "ORDER_PARTS": {
          const needs = await computePartNeeds(tx, booking.shopId, booking.id);
          const short = needs.filter((n) => n.shortage > 0);
          if (short.length === 0) throw conflict("Everything is in stock. Mark the parts ready instead.");
          const items =
            input.items ??
            short.map((n) => ({ itemId: n.itemId, quantity: n.shortage, unitCost: n.unitCost }));
          const po = await createPurchaseOrder(tx, {
            shopId: booking.shopId,
            createdById: actor.userId,
            bookingId: booking.id,
            supplier: input.supplier,
            items,
          });
          note = `Purchase order ${po.number} created`;
          break;
        }

        case "MARK_PARTS_READY": {
          const needs = await computePartNeeds(tx, booking.shopId, booking.id);
          if (needs.some((n) => n.shortage > 0)) throw conflict("Some parts are still short. Order them first.");
          await notifyUser(tx, booking.technicianId, {
            title: "Parts ready",
            body: `All parts for ${booking.ref} are in stock.`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;
        }

        case "ALLOCATE_PARTS": {
          const needs = await computePartNeeds(tx, booking.shopId, booking.id);
          for (const n of needs) {
            const res = await tx.inventoryItem.updateMany({
              where: { id: n.itemId, shopId: booking.shopId, quantity: { gte: n.required } },
              data: { quantity: { decrement: n.required } },
            });
            if (res.count === 0) throw conflict(`Not enough stock for ${n.name}`);
            await tx.allocation.create({
              data: { bookingId: booking.id, itemId: n.itemId, quantity: n.required },
            });
          }
          await notifyUser(tx, booking.technicianId, {
            title: "Parts allocated, start the repair",
            body: `${booking.ref} is back in your queue.`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;
        }

        case "SEND_TO_QC":
          note = input.note;
          await notifyShopRole(tx, booking.shopId, "QC_INSPECTOR", {
            title: "Job waiting for QC",
            body: `${booking.ref}: ${booking.vehicle.make} ${booking.vehicle.model} is in the QC queue.`,
            bookingId: booking.id,
          });
          break;

        case "PICK_QC":
          patch.qcInspectorId = actor.userId;
          break;

        case "QC_PASS":
          note = input.note;
          await tx.qcIssue.updateMany({
            where: { bookingId: booking.id, resolvedAt: null },
            data: { resolvedAt: new Date() },
          });
          await notifyShopRole(tx, booking.shopId, "SERVICE_ADVISOR", {
            title: "Passed QC",
            body: `${booking.ref} is ready. Let the customer know.`,
            bookingId: booking.id,
          });
          break;

        case "QC_FAIL":
          note = input.title;
          await tx.qcIssue.create({
            data: {
              bookingId: booking.id,
              title: input.title,
              description: input.description,
              raisedById: actor.userId,
              raisedByName: actor.name,
            },
          });
          patch.qcInspectorId = null;
          await notifyUser(tx, booking.technicianId, {
            title: "QC failed",
            body: `${booking.ref}: ${input.title}`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;

        case "NOTIFY_READY":
          if (booking.readyNotifiedAt) throw conflict("The customer was already notified");
          patch.readyNotifiedAt = new Date();
          await notifyUser(tx, booking.customerId, {
            title: "Your vehicle is ready for pick-up",
            body: `${booking.vehicle.make} ${booking.vehicle.model} (${booking.ref}) is ready.`,
            shopId: booking.shopId,
            bookingId: booking.id,
          });
          break;

        case "COMPLETE":
          break;
      }

      const to: BookingStatus = check.to ?? booking.status;
      const res = await tx.booking.updateMany({
        // Optimistic lock on status: only one concurrent actor can win a transition.
        where: { id: booking.id, status: booking.status },
        data: { ...patch, status: to },
      });
      if (res.count === 0) throw conflict("Someone else just updated this booking. Refresh and try again.");

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorId: actor.userId,
          actorName: actor.name,
          actorRole: ROLE_LABEL[actor.role],
          action,
          fromStatus: booking.status,
          toStatus: to,
          note,
        },
      });

      return { id: booking.id, ref: booking.ref, status: to };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

interface Ctx {
  tx: Tx;
  actor: Actor;
  booking: LoadedBooking;
}

async function assertStaff(
  tx: Tx,
  shopId: string,
  userId: string,
  role: "TECHNICIAN" | "PARTS_PERSON",
) {
  const m = await tx.membership.findFirst({ where: { shopId, userId, role, isActive: true } });
  if (!m) throw badRequest(`That person is not an active ${ROLE_LABEL[role]} in this shop`);
}

const currentEstimate = (tx: Tx, bookingId: string) =>
  tx.estimate.findFirst({
    where: { bookingId },
    orderBy: { version: "desc" },
    include: { lines: true },
  });

/** Frees the slot and returns any stock allocated to the booking. */
async function cancelBooking({ tx, actor, booking }: Ctx, reason: string | undefined, declined: boolean) {
  await releaseSlot(tx, booking.shopId, booking.slotDate, booking.slotTime);

  const allocations = await tx.allocation.findMany({
    where: { bookingId: booking.id, releasedAt: null },
  });
  for (const a of allocations) {
    await tx.inventoryItem.update({ where: { id: a.itemId }, data: { quantity: { increment: a.quantity } } });
    await tx.allocation.update({ where: { id: a.id }, data: { releasedAt: new Date() } });
  }

  const byCustomer = actor.role === "CUSTOMER";
  const why = reason ? ` Reason: ${reason}` : "";
  if (!byCustomer) {
    await notifyUser(tx, booking.customerId, {
      title: declined ? "Booking declined" : "Booking cancelled",
      body: `Your booking ${booking.ref} was ${declined ? "declined" : "cancelled"} by the shop.${why}`,
      shopId: booking.shopId,
      bookingId: booking.id,
    });
  } else {
    await notifyShopRole(tx, booking.shopId, "SERVICE_ADVISOR", {
      title: "Booking cancelled by customer",
      body: `${booking.customer.name} cancelled ${booking.ref}.${why}`,
      bookingId: booking.id,
    });
  }
  await notifyUser(tx, booking.technicianId, {
    title: "Job cancelled",
    body: `${booking.ref} was cancelled.`,
    shopId: booking.shopId,
    bookingId: booking.id,
  });
}

/** Lines may reference stock items; free-text parts become zero-stock catalog items so shortages are tracked. */
async function resolveLines(tx: Tx, shopId: string, lines: EstimateLineInput[]) {
  const out: Prisma.EstimateLineUncheckedCreateWithoutEstimateInput[] = [];
  for (const l of lines) {
    let itemId: string | null = null;
    if (l.kind === "PART") {
      if (l.itemId) {
        const item = await tx.inventoryItem.findFirst({ where: { id: l.itemId, shopId } });
        if (!item) throw badRequest("A selected part does not belong to this shop");
        itemId = item.id;
      } else {
        const existing = await tx.inventoryItem.findFirst({
          where: { shopId, name: { equals: l.description, mode: "insensitive" } },
        });
        const item =
          existing ??
          (await tx.inventoryItem.create({
            data: {
              shopId,
              name: l.description,
              sku: `NEW-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
              quantity: 0,
              cost: l.unitCost,
            },
          }));
        itemId = item.id;
      }
    }
    out.push({
      kind: l.kind,
      description: l.description,
      itemId,
      quantity: l.quantity,
      unitCost: l.unitCost,
    });
  }
  return out;
}

async function writeEstimate(
  { tx, actor, booking }: Ctx,
  lines: EstimateLineInput[],
  diagnosis: string | undefined,
  bumpRevision: boolean,
) {
  let est = await currentEstimate(tx, booking.id);
  if (!est) est = await tx.estimate.create({ data: { bookingId: booking.id, createdById: actor.userId }, include: { lines: true } });
  if (est.status !== "DRAFT") throw conflict("This estimate has already been sent");

  const resolved = await resolveLines(tx, booking.shopId, lines);
  const total = resolved.reduce((sum, l) => sum + l.quantity! * l.unitCost, 0);

  await tx.estimateLine.deleteMany({ where: { estimateId: est.id } });
  await tx.estimate.update({
    where: { id: est.id },
    data: {
      total,
      diagnosis: diagnosis ?? est.diagnosis,
      revision: bumpRevision ? { increment: 1 } : undefined,
      lines: { create: resolved },
    },
  });
}
