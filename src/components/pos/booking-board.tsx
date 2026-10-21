"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, CalendarDays, ChevronRight, Inbox } from "lucide-react";
import { formatSlot } from "../booking-bits";
import { EmptyState, ListSkeleton, Select, StatusBadge } from "../ui";
import { posPath, usePos, type PosRole } from "./pos-context";
import { BOOKING_STATUSES, TERMINAL_STATUSES, type BookingStatus } from "@/lib/state-machine";
import { STATUS_META } from "@/lib/constants";

export interface BoardBooking {
  id: string;
  ref: string;
  status: BookingStatus;
  slotDate: string;
  slotTime: string;
  technicianId: string | null;
  qcInspectorId: string | null;
  customer: { name: string };
  vehicle: { make: string; model: string; year: number; regNo: string };
  services: { id: string; name: string }[];
}

/** Statuses where the ball is in this role's court. */
const ACTIONABLE: Record<PosRole, BookingStatus[]> = {
  OWNER: ["PENDING", "CONFIRMED", "ESTIMATE_REVIEW", "ESTIMATE_REJECTED", "ESTIMATE_APPROVED", "READY_FOR_PICKUP"],
  SERVICE_ADVISOR: ["PENDING", "CONFIRMED", "ESTIMATE_REVIEW", "ESTIMATE_REJECTED", "ESTIMATE_APPROVED", "READY_FOR_PICKUP"],
  TECHNICIAN: ["ASSIGNED", "INSPECTING", "IN_REPAIR"],
  QC_INSPECTOR: ["QC_PENDING", "QC_IN_PROGRESS"],
  PARTS_PERSON: ["PARTS_PENDING", "PARTS_ORDERED", "PARTS_READY"],
};

const COPY: Record<PosRole, { title: string; empty: string; action: string; other: string }> = {
  OWNER: { title: "All bookings", empty: "No bookings yet.", action: "Needs the front desk", other: "Everything else" },
  SERVICE_ADVISOR: { title: "Bookings", empty: "No bookings yet. New ones appear here with a notification.", action: "Needs your action", other: "In progress elsewhere" },
  TECHNICIAN: { title: "My jobs", empty: "No jobs are assigned to you right now.", action: "Your turn", other: "With others" },
  QC_INSPECTOR: { title: "QC queue", empty: "Nothing is waiting for quality check.", action: "Ready to inspect", other: "Other" },
  PARTS_PERSON: { title: "Jobs awaiting parts", empty: "No jobs are waiting on parts.", action: "Needs parts action", other: "Other" },
};

export function BookingBoard({ headingId }: { headingId?: string }) {
  const { shop, role } = usePos();
  const copy = COPY[role];
  const [filter, setFilter] = useState<"" | BookingStatus>("");
  const { data, isLoading, error } = useSWR<{ bookings: BoardBooking[] }>(
    `/api/pos/${shop.id}/bookings`,
    { refreshInterval: 10_000 },
  );

  const all = data?.bookings ?? [];
  const { mine, others, done } = useMemo(() => {
    const act = ACTIONABLE[role];
    const rows = filter ? all.filter((b) => b.status === filter) : all;
    return {
      mine: rows.filter((b) => act.includes(b.status)),
      others: rows.filter((b) => !act.includes(b.status) && !TERMINAL_STATUSES.includes(b.status)),
      done: rows.filter((b) => TERMINAL_STATUSES.includes(b.status)),
    };
  }, [all, role, filter]);

  const showFilter = role === "OWNER" || role === "SERVICE_ADVISOR";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id={headingId} className="text-2xl sm:text-3xl">
            {copy.title}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {all.length} {all.length === 1 ? "booking" : "bookings"} · updates every few seconds
          </p>
        </div>
        {showFilter && (
          <div className="w-full sm:w-56">
            <label htmlFor="status-filter" className="sr-only">
              Filter by status
            </label>
            <Select id="status-filter" value={filter} onChange={(e) => setFilter(e.target.value as BookingStatus | "")}>
              <option value="">All statuses</option>
              {BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <p className="text-danger">Could not load bookings. Please refresh.</p>
      ) : all.length === 0 ? (
        <EmptyState icon={<Inbox className="h-8 w-8" aria-hidden />} title={copy.empty} />
      ) : (
        <div className="space-y-8">
          <Section title={copy.action} accent items={mine} shopId={shop.id} emptyText="Nothing needs you right now." />
          {others.length > 0 && <Section title={copy.other} items={others} shopId={shop.id} />}
          {done.length > 0 && <Section title="Finished" items={done} shopId={shop.id} muted />}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  shopId,
  accent,
  muted,
  emptyText,
}: {
  title: string;
  items: BoardBooking[];
  shopId: string;
  accent?: boolean;
  muted?: boolean;
  emptyText?: string;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
        {accent && <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />}
        {title}
        <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-ink-soft">{emptyText}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                href={posPath(shopId, `/bookings/${b.id}`)}
                className={`flex h-full items-center gap-3 rounded-xl border bg-surface p-4 shadow-card transition-shadow duration-200 hover:shadow-pop ${
                  accent ? "border-warn/40" : "border-line"
                } ${muted ? "opacity-75" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">
                      {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
                    </p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-ink-soft">
                    {b.customer.name} · <span className="font-mono text-xs">{b.vehicle.regNo}</span>
                  </p>
                  <p className="mt-1 truncate text-sm text-ink-soft">{b.services.map((s) => s.name).join(", ")}</p>
                  <p className="tabular mt-2 flex items-center gap-1.5 text-xs text-ink-soft">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatSlot(b.slotDate, b.slotTime)}
                    <span className="font-mono">· {b.ref}</span>
                  </p>
                </div>
                {accent && <AlertTriangle className="h-5 w-5 shrink-0 text-warn" aria-label="Needs action" />}
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
