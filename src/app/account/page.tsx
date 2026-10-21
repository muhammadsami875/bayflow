"use client";

import Link from "next/link";
import useSWR from "swr";
import { BellRing, CalendarDays, CarFront, ChevronRight, PartyPopper, ReceiptText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { formatSlot, useAuthGuard } from "@/components/booking-bits";
import { buttonClass, Callout, Card, EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/ui";
import { STATUS_META } from "@/lib/constants";
import { TERMINAL_STATUSES, type BookingStatus } from "@/lib/state-machine";

interface Row {
  id: string;
  ref: string;
  status: BookingStatus;
  slotDate: string;
  slotTime: string;
  readyNotifiedAt: string | null;
  pendingEstimate: boolean;
  vehicle: { make: string; model: string; year: number; regNo: string };
  shop: { name: string; city: string };
  services: { id: string; name: string }[];
}

export default function AccountPage() {
  const { me, ready } = useAuthGuard("CUSTOMER");
  const { data, isLoading, error } = useSWR<{ bookings: Row[] }>(ready ? "/api/me/bookings" : null, {
    refreshInterval: 15_000,
  });

  const bookings = data?.bookings ?? [];
  const needsApproval = bookings.filter((b) => b.pendingEstimate && b.status === "AWAITING_CUSTOMER");
  const readyNow = bookings.filter((b) => b.status === "READY_FOR_PICKUP" && b.readyNotifiedAt);
  const active = bookings.filter((b) => !TERMINAL_STATUSES.includes(b.status));
  const past = bookings.filter((b) => TERMINAL_STATUSES.includes(b.status));

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-3xl py-8 sm:py-12">
        <PageHeader
          title={me?.user ? `Hi ${me.user.name.split(" ")[0]}` : "My bookings"}
          description="Track your vehicles and approve estimates."
          action={
            <Link href="/#shops" className={buttonClass("primary", "sm")}>
              New booking
            </Link>
          }
        />

        <div className="space-y-3">
          {needsApproval.map((b) => (
            <Callout
              key={b.id}
              tone="warn"
              icon={<ReceiptText className="h-6 w-6 shrink-0" aria-hidden />}
              title="Estimate awaiting your approval"
              action={
                <Link href={`/account/bookings/${b.id}`} className={buttonClass("primary", "sm")}>
                  Review estimate
                </Link>
              }
            >
              {b.vehicle.make} {b.vehicle.model} at {b.shop.name}
            </Callout>
          ))}
          {readyNow.map((b) => (
            <Callout
              key={b.id}
              tone="accent"
              icon={<PartyPopper className="h-6 w-6 shrink-0" aria-hidden />}
              title="Your vehicle is ready for pick-up"
              action={
                <Link href={`/account/bookings/${b.id}`} className={buttonClass("success", "sm")}>
                  View details
                </Link>
              }
            >
              {b.vehicle.make} {b.vehicle.model} at {b.shop.name}
            </Callout>
          ))}
        </div>

        <section className="mt-8" aria-labelledby="active-h">
          <h2 id="active-h" className="mb-3 text-lg">
            Active bookings
          </h2>
          {isLoading || !ready ? (
            <ListSkeleton />
          ) : error ? (
            <p className="text-danger">We could not load your bookings. Please refresh.</p>
          ) : active.length === 0 ? (
            <EmptyState
              icon={<CarFront className="h-8 w-8" aria-hidden />}
              title="No active bookings"
              description="Find a shop and book your next service."
              action={
                <Link href="/#shops" className={buttonClass("primary", "sm")}>
                  Find a shop
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {active.map((b) => (
                <BookingRow key={b.id} b={b} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-10" aria-labelledby="past-h">
            <h2 id="past-h" className="mb-3 text-lg">
              Past bookings
            </h2>
            <ul className="space-y-3">
              {past.map((b) => (
                <BookingRow key={b.id} b={b} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

function BookingRow({ b }: { b: Row }) {
  return (
    <li>
      <Link href={`/account/bookings/${b.id}`} className="block rounded-xl transition-shadow duration-200 hover:shadow-pop">
        <Card className="flex items-center gap-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">
                {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
              </p>
              <StatusBadge status={b.status} />
            </div>
            <p className="mt-1 text-sm text-ink-soft">{STATUS_META[b.status].customerHint}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
              <span>{b.shop.name}</span>
              <span className="tabular flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden /> {formatSlot(b.slotDate, b.slotTime)}
              </span>
              <span className="font-mono text-xs">{b.ref}</span>
            </p>
          </div>
          {b.pendingEstimate && b.status === "AWAITING_CUSTOMER" && (
            <BellRing className="h-5 w-5 shrink-0 text-warn" aria-label="Action needed" />
          )}
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
        </Card>
      </Link>
    </li>
  );
}
