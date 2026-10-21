"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Wrench } from "lucide-react";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { useMe } from "./providers";
import { buttonClass } from "./ui";
import { api } from "@/lib/api";

/** Public/customer header. The shop POS has its own shell. */
export function SiteHeader() {
  const { me, refresh } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const user = me?.user ?? null;

  async function signOut() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    await refresh();
    router.push("/");
    router.refresh();
  }

  const link = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-muted hover:text-ink aria-[current=page]:text-brand"
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-2">
        <Link href="/" aria-label="BayFlow home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main">
          <span className="hidden sm:block">{link("/#shops", "Find a shop")}</span>
          {user?.type === "CUSTOMER" && link("/account", "My bookings")}
          {user && user.type !== "CUSTOMER" && (
            <Link href="/pos" className={buttonClass("secondary", "sm")}>
              <Wrench className="h-4 w-4" aria-hidden /> Shop dashboard
            </Link>
          )}
          {user && <NotificationBell isCustomer={user.type === "CUSTOMER"} />}
          {user ? (
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-muted hover:text-ink"
            >
              <LogOut className="h-5 w-5" aria-hidden />
            </button>
          ) : (
            <>
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              <Link href="/signup" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>
                List your shop
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page flex flex-col items-start justify-between gap-4 py-8 text-sm text-ink-soft sm:flex-row sm:items-center">
        <Logo />
        <p>Book a mechanic. Track every step. Approve before you pay.</p>
        <div className="flex gap-4">
          <Link href="/login" className="hover:text-ink">
            Sign in
          </Link>
          <Link href="/signup" className="hover:text-ink">
            For shop owners
          </Link>
        </div>
      </div>
    </footer>
  );
}
