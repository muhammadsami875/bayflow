"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ActorRole } from "@/lib/state-machine";

export type PosRole = Exclude<ActorRole, "CUSTOMER">;

export interface PosShop {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  description: string | null;
  openTime: string;
  closeTime: string;
  workingDays: number[];
  slotMinutes: number;
  slotCapacity: number;
  logoUrl: string | null;
  isActive: boolean;
}

interface PosValue {
  shop: PosShop;
  role: PosRole;
  user: { id: string; name: string; email: string };
}

const Ctx = createContext<PosValue | null>(null);

export function PosProvider({ value, children }: { value: PosValue; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePos() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePos must be used inside the POS shell");
  return v;
}

/** URL helpers keep every POS link scoped to the active shop. */
export const posPath = (shopId: string, rest = "") => `/pos/${shopId}${rest}`;
