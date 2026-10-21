import { randomInt } from "node:crypto";
import { db } from "../db";
import { badRequest, conflict, notFound, unauthorized } from "../errors";
import { hashPassword, verifyPassword } from "../password";
import type { SessionUser } from "../auth";
import { notifyShopRole } from "../notify";
import { reserveSlot } from "../slots";
import type { z } from "zod";
import type { createBookingSchema } from "@/lib/validators";

type Input = z.infer<typeof createBookingSchema>;

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeRef = () =>
  "BF-" + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");

/**
 * Creates a PENDING booking. The customer account is created, or reused when the
 * email already exists and the password matches (or the customer is already signed in).
 */
export async function createBooking(input: Input, sessionUser: SessionUser | null) {
  const shop = await db.shop.findFirst({ where: { id: input.shopId, isActive: true } });
  if (!shop) throw notFound("Shop not found");

  const services = await db.service.findMany({
    where: { shopId: shop.id, isActive: true, id: { in: input.serviceIds } },
  });
  if (services.length !== new Set(input.serviceIds).size) {
    throw badRequest("One or more selected services are not offered by this shop");
  }

  // Resolve the customer *before* the transaction (bcrypt is slow).
  let customer: { id: string; name: string; type: SessionUser["type"] };
  let isNewAccount = false;

  if (sessionUser) {
    if (sessionUser.type !== "CUSTOMER") {
      throw conflict("Shop accounts can't book services. Please use a customer account.");
    }
    customer = sessionUser;
  } else {
    const existing = await db.user.findUnique({ where: { email: input.customer.email } });
    if (existing) {
      if (existing.type !== "CUSTOMER") {
        throw conflict("This email belongs to a shop account. Use a different email to book.");
      }
      if (!(await verifyPassword(input.customer.password, existing.passwordHash))) {
        throw unauthorized(
          "An account with this email already exists. Enter its password or sign in first.",
        );
      }
      customer = existing;
    } else {
      if (input.customer.password.length < 8) throw badRequest("Use at least 8 characters for the password");
      customer = await db.user.create({
        data: {
          email: input.customer.email,
          name: input.customer.name,
          phone: input.customer.phone,
          type: "CUSTOMER",
          passwordHash: await hashPassword(input.customer.password),
        },
      });
      isNewAccount = true;
    }
  }

  const booking = await db.$transaction(async (tx) => {
    await reserveSlot(tx, shop.id, input.date, input.time);

    const v = input.vehicle;
    const vehicle = await tx.vehicle.upsert({
      where: { customerId_regNo: { customerId: customer.id, regNo: v.regNo } },
      create: { customerId: customer.id, ...v },
      update: { make: v.make, model: v.model, year: v.year, color: v.color, mileage: v.mileage },
    });

    const created = await tx.booking.create({
      data: {
        ref: makeRef(),
        shopId: shop.id,
        customerId: customer.id,
        vehicleId: vehicle.id,
        slotDate: input.date,
        slotTime: input.time,
        notes: input.notes,
        mileageAtBooking: v.mileage,
        services: { create: services.map((s) => ({ serviceId: s.id, name: s.name })) },
        events: {
          create: {
            actorId: customer.id,
            actorName: customer.name,
            actorRole: "Customer",
            action: "CREATE",
            toStatus: "PENDING",
            note: "Booking created",
          },
        },
      },
    });

    await notifyShopRole(tx, shop.id, "SERVICE_ADVISOR", {
      title: "New booking",
      body: `${customer.name} booked ${v.make} ${v.model} (${v.regNo}) for ${input.date} at ${input.time}.`,
      bookingId: created.id,
    });
    return created;
  });

  return { booking, customerId: customer.id, customerType: customer.type, isNewAccount };
}
