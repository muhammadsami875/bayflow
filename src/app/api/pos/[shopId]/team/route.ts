import { db } from "@/server/db";
import { route, readJson, conflict, type Ctx } from "@/server/errors";
import { requireShopAccess } from "@/server/access";
import { hashPassword } from "@/server/auth";
import { teamCreateSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

/** Owner and Service Advisors can list the team (SAs need it to assign jobs). */
export const GET = route<Ctx<"shopId">>(async (_req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["OWNER", "SERVICE_ADVISOR"]);
  const members = await db.membership.findMany({
    where: { shopId: access.shopId },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  const isOwner = access.role === "OWNER";
  return {
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      isActive: m.isActive,
      name: m.user.name,
      ...(isOwner ? { email: m.user.email, phone: m.user.phone } : {}),
    })),
  };
});

/**
 * Staff accounts are created by the owner only. If the email already belongs to a
 * staff member of another shop, they simply gain a membership here (roles are per shop).
 */
export const POST = route<Ctx<"shopId">>(async (req, { params }) => {
  const access = await requireShopAccess((await params).shopId, ["OWNER"]);
  const input = teamCreateSchema.parse(await readJson(req));

  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing && existing.type === "CUSTOMER") {
    throw conflict("This email belongs to a customer account. Use a different email for staff.");
  }
  if (existing?.type === "OWNER") throw conflict("Owners cannot be added as team members");
  if (!existing && !input.password) throw conflict("Set an initial password for the new team member");

  const user =
    existing ??
    (await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        type: "STAFF",
        passwordHash: await hashPassword(input.password!),
      },
    }));

  const dup = await db.membership.findUnique({
    where: { shopId_userId: { shopId: access.shopId, userId: user.id } },
  });
  if (dup) throw conflict("This person is already on the team of this shop");

  const membership = await db.membership.create({
    data: { shopId: access.shopId, userId: user.id, role: input.role },
  });
  return { member: { id: membership.id, userId: user.id, name: user.name, role: membership.role } };
});
