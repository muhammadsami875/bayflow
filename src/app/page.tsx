import Link from "next/link";
import {
  CalendarCheck,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  Wrench,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Badge, Button, buttonClass, EmptyState, Input, Select } from "@/components/ui";
import { db } from "@/server/db";
import { listPublicShops } from "@/server/shops";
import { WEEKDAYS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function daysLabel(days: number[]) {
  const sorted = [...days].sort();
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  return contiguous && sorted.length > 2
    ? `${WEEKDAYS[sorted[0]]} to ${WEEKDAYS[sorted[sorted.length - 1]]}`
    : sorted.map((d) => WEEKDAYS[d]).join(", ");
}

const SAMPLE_STEPS: { label: string; state: "done" | "now" | "todo"; note?: string }[] = [
  { label: "Booked and confirmed", state: "done" },
  { label: "Vehicle inspected", state: "done", note: "Faulty ignition coil found" },
  { label: "Estimate ready", state: "now", note: "Awaiting your approval" },
  { label: "Parts and repair", state: "todo" },
  { label: "Quality check", state: "todo" },
  { label: "Ready for pick-up", state: "todo" },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string }>;
}) {
  const { q, city } = await searchParams;
  const [shops, cityRows] = await Promise.all([
    listPublicShops({ q: q?.trim() || undefined, city: city || undefined }),
    db.shop.findMany({ where: { isActive: true }, select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } }),
  ]);

  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* Hero */}
        <section className="border-b border-line bg-surface">
          <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <Badge tone="brand" className="mb-4">
                <Wrench className="h-3.5 w-3.5" aria-hidden /> For drivers and independent garages
              </Badge>
              <h1 className="text-4xl font-bold leading-[1.1] sm:text-5xl">
                Book a trusted mechanic.
                <br />
                <span className="text-brand">See every step.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink-soft">
                Pick a shop, choose your slot and track your car from check-in to pick-up. You approve every
                estimate in the app, so there are no surprises and no phone tag.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#shops" className={buttonClass("primary")}>
                  Find a shop
                </a>
                <Link href="/signup" className={buttonClass("secondary")}>
                  I run a repair shop
                </Link>
              </div>
              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 text-sm">
                {[
                  ["Live slots", "Real availability"],
                  ["Itemized", "Parts and labour"],
                  ["Timestamped", "Every approval"],
                ].map(([a, b]) => (
                  <div key={a}>
                    <dt className="font-semibold text-ink">{a}</dt>
                    <dd className="text-ink-soft">{b}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-2xl border border-line bg-bg p-5 shadow-card sm:p-6" aria-label="Example of a tracked booking">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Example booking</p>
                  <p className="mt-1 text-lg font-semibold">Honda Civic 2016</p>
                  <p className="font-mono text-sm text-ink-soft">LEA-1234 · BF-7K2M9Q</p>
                </div>
                <Badge tone="warn">Awaiting you</Badge>
              </div>
              <ol className="mt-5 space-y-3">
                {SAMPLE_STEPS.map((s) => (
                  <li key={s.label} className="flex items-start gap-3">
                    {s.state === "done" ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                    ) : s.state === "now" ? (
                      <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
                    ) : (
                      <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line" aria-hidden />
                    )}
                    <div>
                      <p className={s.state === "todo" ? "text-ink-soft" : "font-medium"}>
                        {s.label}
                        <span className="sr-only">{s.state === "done" ? " (done)" : s.state === "now" ? " (current step)" : " (upcoming)"}</span>
                      </p>
                      {s.note && <p className="text-sm text-ink-soft">{s.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex items-center justify-between rounded-lg bg-surface px-4 py-3">
                <span className="text-sm text-ink-soft">Estimate total</span>
                <span className="tabular font-mono text-lg font-medium">PKR 16,100</span>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="container-page py-14">
          <h2 className="text-2xl sm:text-3xl">How BayFlow works</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: CalendarCheck,
                title: "Book in minutes",
                body: "Choose the shop, tell them what is wrong, pick a free slot and add your vehicle details.",
              },
              {
                icon: ClipboardCheck,
                title: "Approve a clear estimate",
                body: "After the inspection you get an itemized estimate. Accept or reject it in the app.",
              },
              {
                icon: ShieldCheck,
                title: "Quality checked, then ready",
                body: "Every repair passes a separate quality check before we tell you it is ready.",
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="rounded-xl border border-line bg-surface p-6 shadow-card">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-4 text-xs font-semibold text-ink-soft">Step {i + 1}</p>
                <h3 className="mt-1 text-lg">{title}</h3>
                <p className="mt-2 text-ink-soft">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Shops */}
        <section id="shops" className="scroll-mt-20 border-t border-line bg-surface">
          <div className="container-page py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl">Repair shops near you</h2>
                <p className="mt-1 text-ink-soft">
                  {shops.length} {shops.length === 1 ? "shop" : "shops"} {q || city ? "match your search" : "on BayFlow"}
                </p>
              </div>
              <form action="/" method="get" className="flex w-full flex-wrap gap-2 sm:w-auto" role="search">
                <div className="relative min-w-0 flex-1 sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
                  <Input name="q" defaultValue={q} placeholder="Shop or service" aria-label="Search shops or services" className="pl-9" />
                </div>
                <Select name="city" defaultValue={city ?? ""} aria-label="Filter by city" className="w-auto min-w-36">
                  <option value="">All cities</option>
                  {cityRows.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Search
                </Button>
              </form>
            </div>

            {shops.length === 0 ? (
              <div className="mt-8">
                <EmptyState
                  icon={<Search className="h-8 w-8" aria-hidden />}
                  title="No shops match that search"
                  description="Try another city or a different service name."
                  action={
                    <Link href="/#shops" className={buttonClass("secondary", "sm")}>
                      Clear filters
                    </Link>
                  }
                />
              </div>
            ) : (
              <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {shops.map((s) => (
                  <li key={s.id} className="flex flex-col rounded-xl border border-line bg-bg p-5 shadow-card transition-shadow duration-200 hover:shadow-pop">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg">{s.name}</h3>
                      <span className="flex shrink-0 items-center gap-1 text-sm text-ink-soft" title="Ratings coming soon">
                        <Star className="h-4 w-4" aria-hidden /> New
                      </span>
                    </div>
                    <p className="mt-2 flex items-start gap-2 text-sm text-ink-soft">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {s.address}, {s.city}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                      <Clock className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="tabular">
                        {daysLabel(s.workingDays)}, {s.openTime} to {s.closeTime}
                      </span>
                    </p>
                    {s.description && <p className="mt-3 text-sm text-ink-soft">{s.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {s.services.slice(0, 5).map((sv) => (
                        <Badge key={sv.id} tone="neutral">
                          {sv.name.split(" / ")[0]}
                        </Badge>
                      ))}
                      {s.services.length > 5 && <Badge tone="neutral">+{s.services.length - 5} more</Badge>}
                    </div>
                    <div className="mt-auto pt-5">
                      <Link href={`/shops/${s.id}/book`} className={buttonClass("primary", "md", "w-full")}>
                        Book at {s.name.split(" ")[0]}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Owner CTA */}
        <section className="bg-navy text-white">
          <div className="container-page flex flex-col items-start justify-between gap-5 py-12 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl text-white">Run a garage? Put the whole job on one screen.</h2>
              <p className="mt-2 max-w-2xl text-slate-300">
                Bookings, inspections, estimates, parts and quality checks. Every role sees only their own work,
                and you see every branch.
              </p>
            </div>
            <Link href="/signup" className={buttonClass("primary", "md", "shrink-0 bg-white !text-navy hover:!bg-slate-100")}>
              Create your shop
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
