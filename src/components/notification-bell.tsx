"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bell, CheckCheck } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  title: string;
  body: string;
  shopId: string | null;
  bookingId: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** In-app notification bell with unread count. Polls every 10s so new work shows up without a refresh. */
export function NotificationBell({ isCustomer }: { isCustomer: boolean }) {
  const { data, mutate } = useSWR<{ items: Notification[]; unread: number }>("/api/notifications", {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
  });
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  async function markAll() {
    await api("/api/notifications/read", { method: "POST", body: {} });
    mutate();
  }

  const hrefFor = (n: Notification) =>
    !n.bookingId
      ? null
      : isCustomer
        ? `/account/bookings/${n.bookingId}`
        : n.shopId
          ? `/pos/${n.shopId}/bookings/${n.bookingId}`
          : null;

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-muted hover:text-ink"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && (
          <span className="tabular absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button
              type="button"
              onClick={markAll}
              disabled={unread === 0}
              className="flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-brand transition-colors hover:bg-brand-soft disabled:text-ink-soft disabled:hover:bg-transparent"
            >
              <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
            </button>
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {(data?.items ?? []).length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-ink-soft">You are all caught up.</li>
            )}
            {(data?.items ?? []).map((n) => {
              const href = hrefFor(n);
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p className={clsx("text-sm", !n.readAt ? "font-semibold" : "font-medium")}>{n.title}</p>
                    <span className="shrink-0 text-xs text-ink-soft">{timeAgo(n.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>
                </>
              );
              return (
                <li key={n.id} className={clsx(!n.readAt && "bg-brand-soft/40")}>
                  {href ? (
                    <Link
                      href={href}
                      onClick={async () => {
                        setOpen(false);
                        await api("/api/notifications/read", { method: "POST", body: { ids: [n.id] } });
                        mutate();
                      }}
                      className="block px-4 py-3 transition-colors hover:bg-muted"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="px-4 py-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
