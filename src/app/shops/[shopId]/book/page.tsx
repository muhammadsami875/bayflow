"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock, MapPin } from "lucide-react";
import clsx from "clsx";
import { SiteHeader } from "@/components/site-header";
import { useMe } from "@/components/providers";
import { Button, buttonClass, Card, Field, InlineError, Input, ListSkeleton, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money, WEEKDAYS } from "@/lib/constants";

interface Shop {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  openTime: string;
  closeTime: string;
  workingDays: number[];
  slotMinutes: number;
  services: { id: string; name: string; description: string | null; durationMin: number; basePrice: number | null }[];
}

const STEPS = ["Problem", "Time", "Your details", "Review"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function BookingWizard({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = use(params);
  const { me } = useMe();
  const { data, error: loadError, isLoading } = useSWR<{ shop: Shop }>(`/api/shops/${shopId}`);
  const shop = data?.shop;
  const customer = me?.user?.type === "CUSTOMER" ? me.user : null;

  const [step, setStep] = useState(0);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [who, setWho] = useState({ name: "", email: "", phone: "", password: "" });
  const [car, setCar] = useState({ regNo: "", make: "", model: "", year: "", color: "", mileage: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; ref: string } | null>(null);

  const days = useMemo(() => {
    const out: { value: string; weekday: number; label: string; day: number; month: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      out.push({
        value: ymd(d),
        weekday: d.getDay(),
        label: i === 0 ? "Today" : WEEKDAYS[d.getDay()],
        day: d.getDate(),
        month: d.toLocaleString("en", { month: "short" }),
      });
    }
    return out;
  }, []);

  const slotsKey = shop && date ? `/api/shops/${shop.id}/slots?date=${date}` : null;
  const { data: slotData, isLoading: slotsLoading, mutate: refreshSlots } = useSWR<{
    slots: { time: string; remaining: number; available: boolean }[];
  }>(slotsKey, { revalidateOnFocus: true });

  const chosenServices = shop?.services.filter((s) => serviceIds.includes(s.id)) ?? [];
  const estTotal = chosenServices.reduce((s, x) => s + (x.basePrice ?? 0), 0);

  const toggleService = (id: string) =>
    setServiceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  function validate(forStep: number) {
    const e: Record<string, string> = {};
    if (forStep === 0 && serviceIds.length === 0) e.services = "Pick at least one problem or service.";
    if (forStep === 1) {
      if (!date) e.date = "Choose a day.";
      else if (!time) e.time = "Choose a time slot.";
    }
    if (forStep === 2) {
      if (!customer) {
        if (!who.name.trim()) e.name = "Enter your name.";
        if (!/^\S+@\S+\.\S+$/.test(who.email)) e.email = "Enter a valid email.";
        if (!who.password) e.password = "Enter a password.";
        else if (who.password.length < 8) e.password = "Use at least 8 characters, or enter your existing password.";
        if (who.phone && !/^[+0-9()\-\s]{7,20}$/.test(who.phone)) e.phone = "Enter a valid phone number.";
      }
      if (!car.regNo.trim()) e.regNo = "Enter the registration number.";
      if (!car.make.trim()) e.make = "Enter the make.";
      if (!car.model.trim()) e.model = "Enter the model.";
      const y = Number(car.year);
      if (!car.year || !Number.isInteger(y) || y < 1950 || y > new Date().getFullYear() + 1) e.year = "Enter a valid year.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => validate(step) && setStep((s) => s + 1);

  async function confirm() {
    setSubmitError("");
    setBusy(true);
    try {
      const res = await api<{ booking: { id: string; ref: string } }>("/api/bookings", {
        method: "POST",
        body: {
          shopId,
          serviceIds,
          notes: notes || undefined,
          date,
          time,
          customer: {
            name: customer?.name ?? who.name,
            email: customer?.email ?? who.email,
            password: customer ? "session" : who.password,
            phone: who.phone || undefined,
          },
          vehicle: {
            regNo: car.regNo,
            make: car.make,
            model: car.model,
            year: Number(car.year),
            color: car.color || undefined,
            mileage: car.mileage ? Number(car.mileage) : undefined,
          },
        },
      });
      setDone(res.booking);
    } catch (err) {
      const msg = errorMessage(err);
      setSubmitError(msg);
      if (/slot|time/i.test(msg)) {
        setTime("");
        refreshSlots();
        setStep(1);
      }
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <Shell>
        <ListSkeleton rows={4} />
      </Shell>
    );
  }
  if (loadError || !shop) {
    return (
      <Shell>
        <Card className="p-8 text-center">
          <h1 className="text-xl">We could not find that shop</h1>
          <p className="mt-2 text-ink-soft">It may have been removed or is not taking bookings right now.</p>
          <Link href="/#shops" className={buttonClass("primary", "md", "mt-5")}>
            Browse shops
          </Link>
        </Card>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-accent" aria-hidden />
          <h1 className="mt-4 text-2xl">Booking requested</h1>
          <p className="mt-2 text-ink-soft">
            {shop.name} will confirm your slot shortly. We will notify you in the app.
          </p>
          <p className="mt-5 rounded-lg bg-muted px-4 py-3 font-mono text-lg tracking-wider">{done.ref}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {date} at {time}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href={`/account/bookings/${done.id}`} className={buttonClass("primary")}>
              Track this booking
            </Link>
            <Link href="/" className={buttonClass("secondary")}>
              Back to shops
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6">
        <Link href="/#shops" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All shops
        </Link>
        <h1 className="text-2xl sm:text-3xl">Book at {shop.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" aria-hidden /> {shop.address}, {shop.city}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" aria-hidden /> {shop.openTime} to {shop.closeTime}
          </span>
        </p>
      </div>

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Booking progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <div className={clsx("h-1.5 rounded-full transition-colors duration-300", i <= step ? "bg-brand" : "bg-line")} />
            <p className={clsx("mt-2 text-xs font-medium sm:text-sm", i === step ? "text-ink" : "text-ink-soft")}>
              <span className="tabular mr-1">{i + 1}.</span>
              {label}
            </p>
          </li>
        ))}
      </ol>

      <Card className="p-5 sm:p-7">
        {/* STEP 0 */}
        {step === 0 && (
          <div>
            <h2 className="text-xl">What does your car need?</h2>
            <p className="mt-1 text-sm text-ink-soft">Choose one or more. You can add details below.</p>
            <fieldset className="mt-5">
              <legend className="sr-only">Problems and services</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {shop.services.map((s) => {
                  const on = serviceIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={clsx(
                        "flex min-h-[4.25rem] items-start gap-3 rounded-xl border p-4 transition-colors duration-200",
                        on ? "border-brand bg-brand-soft/50" : "border-line hover:border-slate-300",
                      )}
                    >
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleService(s.id)} />
                      <span
                        aria-hidden
                        className={clsx(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                          on ? "border-brand bg-brand text-white" : "border-slate-300",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{s.name}</span>
                        {s.description && <span className="block text-sm text-ink-soft">{s.description}</span>}
                        <span className="tabular mt-1 block text-xs text-ink-soft">
                          About {s.durationMin} min{s.basePrice ? ` · from ${money(s.basePrice)}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.services && <p role="alert" className="mt-2 text-sm text-danger">{errors.services}</p>}
            </fieldset>
            <Field label="Anything else the shop should know?" htmlFor="notes" className="mt-5" hint="For example when it started, noises, warning lights.">
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
            </Field>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <h2 className="text-xl">Pick a day and time</h2>
            <p className="mt-1 text-sm text-ink-soft">Only open slots are shown.</p>
            <div className="mt-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="radiogroup" aria-label="Day">
              {days.map((d) => {
                const open = shop.workingDays.includes(d.weekday);
                const on = date === d.value;
                return (
                  <button
                    key={d.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!open}
                    onClick={() => {
                      setDate(d.value);
                      setTime("");
                    }}
                    className={clsx(
                      "flex min-h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors duration-200",
                      on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-slate-300",
                      !open && "opacity-40",
                    )}
                  >
                    <span className="text-xs">{d.label}</span>
                    <span className="tabular text-xl font-semibold">{d.day}</span>
                    <span className="text-xs">{open ? d.month : "Closed"}</span>
                  </button>
                );
              })}
            </div>
            {errors.date && <p role="alert" className="mt-2 text-sm text-danger">{errors.date}</p>}

            {date && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Available times</p>
                {slotsLoading ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <div key={i} className="skeleton h-11" />
                    ))}
                  </div>
                ) : (slotData?.slots ?? []).length === 0 ? (
                  <p className="rounded-lg bg-muted px-4 py-3 text-sm text-ink-soft">No slots on this day. Try another date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Time">
                    {slotData!.slots.map((s) => (
                      <button
                        key={s.time}
                        type="button"
                        role="radio"
                        aria-checked={time === s.time}
                        disabled={!s.available}
                        onClick={() => setTime(s.time)}
                        className={clsx(
                          "tabular min-h-11 rounded-lg border px-2 py-2 text-sm font-medium transition-colors duration-200",
                          time === s.time ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-slate-300",
                          !s.available && "text-slate-400 line-through",
                        )}
                      >
                        {s.time}
                        <span className="block text-[11px] font-normal opacity-80">{s.available ? `${s.remaining} left` : "Full"}</span>
                      </button>
                    ))}
                  </div>
                )}
                {errors.time && <p role="alert" className="mt-2 text-sm text-danger">{errors.time}</p>}
              </div>
            )}
            <InlineError>{submitError}</InlineError>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h2 className="text-xl">Your details</h2>
            {customer ? (
              <p className="mt-2 rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand-strong">
                Booking as <strong>{customer.name}</strong> ({customer.email}).
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-ink-soft">
                  Your email and password create your account so you can track this booking. Already booked
                  before? Use the same email and password.{" "}
                  <Link href={`/login?next=${encodeURIComponent(`/shops/${shopId}/book`)}`} className="font-medium text-brand hover:underline">
                    Sign in instead
                  </Link>
                </p>
                <fieldset className="mt-5 grid gap-4 sm:grid-cols-2">
                  <legend className="sr-only">Personal details</legend>
                  <Field label="Full name" htmlFor="c-name" required error={errors.name}>
                    <Input id="c-name" autoComplete="name" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} invalid={!!errors.name} />
                  </Field>
                  <Field label="Phone" htmlFor="c-phone" hint="Optional" error={errors.phone}>
                    <Input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} invalid={!!errors.phone} />
                  </Field>
                  <Field label="Email" htmlFor="c-email" required error={errors.email}>
                    <Input id="c-email" type="email" inputMode="email" autoComplete="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} invalid={!!errors.email} />
                  </Field>
                  <Field label="Password" htmlFor="c-pass" required error={errors.password} hint="At least 8 characters">
                    <Input id="c-pass" type="password" autoComplete="new-password" value={who.password} onChange={(e) => setWho({ ...who, password: e.target.value })} invalid={!!errors.password} />
                  </Field>
                </fieldset>
              </>
            )}

            <h3 className="mt-7 text-lg">Vehicle</h3>
            <fieldset className="mt-3 grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Vehicle details</legend>
              <Field label="Registration number" htmlFor="v-reg" required error={errors.regNo}>
                <Input id="v-reg" value={car.regNo} onChange={(e) => setCar({ ...car, regNo: e.target.value })} className="uppercase" placeholder="LEA-1234" invalid={!!errors.regNo} />
              </Field>
              <Field label="Make" htmlFor="v-make" required error={errors.make}>
                <Input id="v-make" value={car.make} onChange={(e) => setCar({ ...car, make: e.target.value })} placeholder="Honda" invalid={!!errors.make} />
              </Field>
              <Field label="Model" htmlFor="v-model" required error={errors.model}>
                <Input id="v-model" value={car.model} onChange={(e) => setCar({ ...car, model: e.target.value })} placeholder="Civic" invalid={!!errors.model} />
              </Field>
              <Field label="Year" htmlFor="v-year" required error={errors.year}>
                <Input id="v-year" type="number" inputMode="numeric" value={car.year} onChange={(e) => setCar({ ...car, year: e.target.value })} placeholder="2016" invalid={!!errors.year} />
              </Field>
              <Field label="Colour" htmlFor="v-color" hint="Optional">
                <Input id="v-color" value={car.color} onChange={(e) => setCar({ ...car, color: e.target.value })} />
              </Field>
              <Field label="Mileage (km)" htmlFor="v-km" hint="Optional">
                <Input id="v-km" type="number" inputMode="numeric" value={car.mileage} onChange={(e) => setCar({ ...car, mileage: e.target.value })} />
              </Field>
            </fieldset>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <h2 className="text-xl">Review and confirm</h2>
            <dl className="mt-5 divide-y divide-line rounded-xl border border-line">
              <Row label="Shop">{shop.name}, {shop.city}</Row>
              <Row label="When">
                <span className="tabular">
                  {date} at {time}
                </span>
              </Row>
              <Row label="Problems">
                <ul className="list-disc pl-4">
                  {chosenServices.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ul>
                {notes && <p className="mt-1 text-ink-soft">“{notes}”</p>}
              </Row>
              <Row label="Vehicle">
                {car.year} {car.make} {car.model} · <span className="font-mono">{car.regNo.toUpperCase()}</span>
              </Row>
              <Row label="You">
                {customer?.name ?? who.name} · {customer?.email ?? who.email}
              </Row>
            </dl>
            {estTotal > 0 && (
              <p className="mt-3 text-sm text-ink-soft">
                Starting prices add up to about <span className="tabular font-medium text-ink">{money(estTotal)}</span>. The shop sends
                a final itemized estimate after inspecting your car, and you approve it before any repair work.
              </p>
            )}
            <div className="mt-4">
              <InlineError>{submitError}</InlineError>
            </div>
          </div>
        )}

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5">
          <Button variant="ghost" onClick={() => { setSubmitError(""); setStep((s) => s - 1); }} disabled={step === 0 || busy}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={next}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={confirm} loading={busy}>
              Confirm booking
            </Button>
          )}
        </div>
      </Card>
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-3xl py-8 sm:py-12">
        {children}
      </main>
    </>
  );
}
