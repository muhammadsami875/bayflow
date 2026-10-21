"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  Boxes,
  ClipboardList,
  ClipboardCheck,
  Hammer,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Settings,
  ShoppingCart,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "../logo";
import { NotificationBell } from "../notification-bell";
import { useMe } from "../providers";
import { Select } from "../ui";
import { posPath, usePos, type PosRole } from "./pos-context";
import { ROLE_LABEL } from "@/lib/constants";
import { api } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

function navFor(role: PosRole, shopId: string): NavItem[] {
  const p = (r = "") => posPath(shopId, r);
  switch (role) {
    case "OWNER":
      return [
        { href: p(), label: "Overview", icon: LayoutDashboard, exact: true },
        { href: p("/bookings"), label: "Bookings", icon: ClipboardList },
        { href: p("/inventory"), label: "Inventory", icon: Boxes },
        { href: p("/orders"), label: "Purchase orders", icon: ShoppingCart },
        { href: p("/team"), label: "Team", icon: Users },
        { href: p("/services"), label: "Services", icon: Wrench },
        { href: p("/settings"), label: "Shop settings", icon: Settings },
      ];
    case "SERVICE_ADVISOR":
      return [{ href: p(), label: "Bookings", icon: ClipboardList, exact: true }];
    case "TECHNICIAN":
      return [{ href: p(), label: "My jobs", icon: Hammer, exact: true }];
    case "QC_INSPECTOR":
      return [{ href: p(), label: "QC queue", icon: ClipboardCheck, exact: true }];
    case "PARTS_PERSON":
      return [
        { href: p(), label: "Jobs awaiting parts", icon: PackageSearch, exact: true },
        { href: p("/inventory"), label: "Inventory", icon: Boxes },
        { href: p("/orders"), label: "Purchase orders", icon: ShoppingCart },
      ];
  }
}

export function PosShell({ children }: { children: ReactNode }) {
  const { shop, role, user } = usePos();
  const { me, refresh } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = navFor(role, shop.id);
  const shops = me?.shops ?? [];

  async function signOut() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    await refresh();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav aria-label="Shop navigation" className="flex-1 space-y-1 px-3">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200",
              active ? "bg-brand text-white" : "text-slate-300 hover:bg-navy-soft hover:text-white",
            )}
          >
            <it.icon className="h-[18px] w-[18px]" aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-navy py-4">
      <div className="flex items-center justify-between px-5 pb-4">
        <Link href="/" aria-label="BayFlow home">
          <Logo light />
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-navy-soft lg:hidden"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="px-4 pb-4">
        <label htmlFor="shop-switch" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
          {shops.length > 1 ? "Switch shop" : "Shop"}
        </label>
        {shops.length > 1 ? (
          <Select
            id="shop-switch"
            value={shop.id}
            onChange={(e) => router.push(posPath(e.target.value))}
            className="border-navy-soft bg-navy-soft text-white"
          >
            {shops.map((s) => (
              <option key={`${s.id}-${s.role}`} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        ) : (
          <p id="shop-switch" className="rounded-lg bg-navy-soft px-3 py-2.5 text-sm font-medium text-white">
            {shop.name}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          Your role here: <span className="font-medium text-slate-200">{ROLE_LABEL[role]}</span>
        </p>
      </div>

      {nav}

      <div className="mt-4 border-t border-navy-soft px-4 pt-4">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-slate-400">{user.email}</p>
        <button
          type="button"
          onClick={signOut}
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm text-slate-300 transition-colors hover:bg-navy-soft hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-pop">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{shop.name}</p>
              <p className="truncate text-xs text-ink-soft">{shop.city}</p>
            </div>
          </div>
          <NotificationBell isCustomer={false} />
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
