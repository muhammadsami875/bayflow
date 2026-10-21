import { hashPassword, verifyPassword } from "./password";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserType } from "@prisma/client";
import { db } from "./db";
import { unauthorized, forbidden } from "./errors";

const COOKIE = "bayflow_session";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set (16+ chars)");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

export { hashPassword, verifyPassword };

export async function startSession(userId: string, type: UserType) {
  const token = await new SignJWT({ type })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || "7d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  type: UserType;
}

/** Re-reads the user from the DB on every call so deactivation/removal takes effect immediately. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, phone: true, type: true },
    });
    return user;
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireCustomer(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.type !== "CUSTOMER") throw forbidden("This area is for customers");
  return user;
}
