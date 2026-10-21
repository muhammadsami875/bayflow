"use client";

import { useState } from "react";
import clsx from "clsx";
import { Button, Field, InlineError, Input, Textarea } from "../ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { WEEKDAYS } from "@/lib/constants";

export interface ShopFormValues {
  name: string;
  description: string;
  address: string;
  city: string;
  phone: string;
  openTime: string;
  closeTime: string;
  workingDays: number[];
  slotMinutes: number;
  slotCapacity: number;
  logoUrl: string;
}

export const EMPTY_SHOP: ShopFormValues = {
  name: "",
  description: "",
  address: "",
  city: "",
  phone: "",
  openTime: "09:00",
  closeTime: "18:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  slotMinutes: 60,
  slotCapacity: 2,
  logoUrl: "",
};

/** Used for creating a shop and for editing its settings. */
export function ShopForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: ShopFormValues;
  submitLabel: string;
  onSubmit: (values: ShopFormValues) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const text = (k: keyof ShopFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const num = (k: "slotMinutes" | "slotCapacity") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((s) => ({ ...s, [k]: Number(e.target.value) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(v);
    } catch (err) {
      if (err instanceof ApiClientError && err.details) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, m]) => [k, m?.[0] ?? ""])));
      }
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <InlineError>{error}</InlineError>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shop name" htmlFor="s-name" required error={errors.name} className="sm:col-span-2">
          <Input id="s-name" value={v.name} onChange={text("name")} invalid={!!errors.name} />
        </Field>
        <Field label="Address" htmlFor="s-address" required error={errors.address}>
          <Input id="s-address" value={v.address} onChange={text("address")} invalid={!!errors.address} />
        </Field>
        <Field label="City" htmlFor="s-city" required error={errors.city}>
          <Input id="s-city" value={v.city} onChange={text("city")} invalid={!!errors.city} />
        </Field>
        <Field label="Phone" htmlFor="s-phone" required error={errors.phone}>
          <Input id="s-phone" type="tel" inputMode="tel" value={v.phone} onChange={text("phone")} invalid={!!errors.phone} />
        </Field>
        <Field label="Logo URL" htmlFor="s-logo" hint="Optional" error={errors.logoUrl}>
          <Input id="s-logo" type="url" value={v.logoUrl} onChange={text("logoUrl")} invalid={!!errors.logoUrl} />
        </Field>
        <Field label="Short description" htmlFor="s-desc" className="sm:col-span-2" hint="Shown on the public shop card">
          <Textarea id="s-desc" value={v.description} onChange={text("description")} maxLength={500} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Working days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => {
            const on = v.workingDays.includes(i);
            return (
              <label
                key={d}
                className={clsx(
                  "flex min-h-11 min-w-14 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors duration-200",
                  on ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-soft hover:border-slate-300",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() =>
                    setV((s) => ({
                      ...s,
                      workingDays: on ? s.workingDays.filter((x) => x !== i) : [...s.workingDays, i].sort(),
                    }))
                  }
                />
                {d}
              </label>
            );
          })}
        </div>
        {errors.workingDays && <p role="alert" className="mt-1 text-sm text-danger">{errors.workingDays}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Opens" htmlFor="s-open" required error={errors.openTime}>
          <Input id="s-open" type="time" value={v.openTime} onChange={text("openTime")} />
        </Field>
        <Field label="Closes" htmlFor="s-close" required error={errors.closeTime}>
          <Input id="s-close" type="time" value={v.closeTime} onChange={text("closeTime")} invalid={!!errors.closeTime} />
        </Field>
        <Field label="Slot length (min)" htmlFor="s-slot" required error={errors.slotMinutes}>
          <Input id="s-slot" type="number" inputMode="numeric" min={15} step={15} value={v.slotMinutes} onChange={num("slotMinutes")} />
        </Field>
        <Field label="Cars per slot" htmlFor="s-cap" required hint="Capacity" error={errors.slotCapacity}>
          <Input id="s-cap" type="number" inputMode="numeric" min={1} value={v.slotCapacity} onChange={num("slotCapacity")} />
        </Field>
      </div>

      <Button type="submit" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

export const toPayload = (v: ShopFormValues) => ({
  ...v,
  description: v.description || undefined,
  logoUrl: v.logoUrl || undefined,
});

export async function createShopRequest(v: ShopFormValues) {
  return api<{ shop: { id: string } }>("/api/pos/shops", { method: "POST", body: toPayload(v) });
}
