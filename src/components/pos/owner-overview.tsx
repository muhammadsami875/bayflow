"use client";

import Link from "next/link";
import useSWR from "swr";
import { Boxes, ClipboardList, PackageX, ShoppingCart, Users } from "lucide-react";
import { Badge, Card, CardHeader, ListSkeleton, PageHeader, StatusBadge } from "../ui";
import { posPath, usePos } from "./pos-context";
import { money, ROLE_LABEL } from "@/lib/constants";
import { BOOKING_STATUSES, TERMINAL_STATUSES, type BookingStatus } from "@/lib/state-machine";

interface Overview {
  bookingsByStatus: Partial<Record<BookingStatus, number>>;
  team: { id: string; name: string; email: string; role: keyof typeof ROLE_LABEL; isActive: boolean }[];
  inventory: { items: number; lowStock: number; value: number };
  openOrders: number;
}

export function OwnerOverview() {
  const { shop } = usePos();
  const { data, isLoading } = useSWR<Overview>(`/api/pos/${shop.id}/overview`, { refreshInterval: 15_000 });

  if (isLoading || !data) return <ListSkeleton rows={4} />;

  const total = Object.values(data.bookingsByStatus).reduce((a, b) => a + (b ?? 0), 0);
  const active = BOOKING_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s)).reduce(
    (a, s) => a + (data.bookingsByStatus[s] ?? 0),
    0,
  );
  const present = BOOKING_STATUSES.filter((s) => (data.bookingsByStatus[s] ?? 0) > 0);
  const max = Math.max(1, ...present.map((s) => data.bookingsByStatus[s] ?? 0));

  const stats = [
    { label: "Active jobs", value: active, icon: ClipboardList, href: posPath(shop.id, "/bookings") },
    { label: "Team members", value: data.team.filter((t) => t.isActive).length, icon: Users, href: posPath(shop.id, "/team") },
    { label: "Low-stock parts", value: data.inventory.lowStock, icon: PackageX, href: posPath(shop.id, "/inventory"), warn: data.inventory.lowStock > 0 },
    { label: "Open purchase orders", value: data.openOrders, icon: ShoppingCart, href: posPath(shop.id, "/orders") },
  ];

  return (
    <div>
      <PageHeader title="Overview" description={`${shop.name}, ${shop.city}`} />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="block rounded-xl transition-shadow duration-200 hover:shadow-pop">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-ink-soft">{s.label}</p>
                  <s.icon className={`h-5 w-5 ${s.warn ? "text-warn" : "text-ink-soft"}`} aria-hidden />
                </div>
                <p className="tabular mt-2 text-3xl font-semibold">{s.value}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bookings by status" description={`${total} total`} />
          <div className="p-5">
            {present.length === 0 ? (
              <p className="text-sm text-ink-soft">No bookings yet.</p>
            ) : (
              <ul className="space-y-3">
                {present.map((s) => {
                  const n = data.bookingsByStatus[s] ?? 0;
                  return (
                    <li key={s} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-3">
                      <span className="min-w-0">
                        <StatusBadge status={s} />
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
                      </span>
                      <span className="tabular text-right text-sm font-medium">{n}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Team"
              action={
                <Link href={posPath(shop.id, "/team")} className="text-sm font-medium text-brand hover:underline">
                  Manage
                </Link>
              }
            />
            <ul className="divide-y divide-line">
              {data.team.length === 0 && <li className="px-5 py-4 text-sm text-ink-soft">No team members yet.</li>}
              {data.team.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="truncate text-xs text-ink-soft">{t.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!t.isActive && <Badge tone="danger">Inactive</Badge>}
                    <Badge tone="brand">{ROLE_LABEL[t.role]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Inventory"
              action={
                <Link href={posPath(shop.id, "/inventory")} className="text-sm font-medium text-brand hover:underline">
                  Open
                </Link>
              }
            />
            <dl className="grid grid-cols-3 gap-4 p-5">
              <div>
                <dt className="text-xs text-ink-soft">Part types</dt>
                <dd className="tabular mt-1 flex items-center gap-1.5 text-xl font-semibold">
                  <Boxes className="h-4 w-4 text-ink-soft" aria-hidden /> {data.inventory.items}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Low stock</dt>
                <dd className="tabular mt-1 text-xl font-semibold">{data.inventory.lowStock}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">Stock value</dt>
                <dd className="tabular mt-1 text-xl font-semibold">{money(data.inventory.value)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
