"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Pencil, Plus, Wrench } from "lucide-react";
import { Modal } from "@/components/modal";
import { usePos } from "@/components/pos/pos-context";
import { useToast } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, InlineError, Input, ListSkeleton, PageHeader, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/constants";

interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  basePrice: number | null;
  isActive: boolean;
}

const BLANK = { name: "", description: "", durationMin: 60, basePrice: "" as number | "" };

export default function ServicesPage({ params }: { params: Promise<{ shopId: string }> }) {
  use(params);
  const { shop } = usePos();
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ services: Service[] }>(`/api/pos/${shop.id}/services`);
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const services = data?.services ?? [];

  function open(s: Service | "new") {
    setErr("");
    setForm(s === "new" ? BLANK : { name: s.name, description: s.description ?? "", durationMin: s.durationMin, basePrice: s.basePrice ?? "" });
    setEditing(s);
  }

  async function save() {
    setBusy(true);
    setErr("");
    const body = {
      name: form.name,
      description: form.description || undefined,
      durationMin: form.durationMin,
      basePrice: form.basePrice === "" ? undefined : form.basePrice,
    };
    try {
      if (editing === "new") await api(`/api/pos/${shop.id}/services`, { method: "POST", body });
      else if (editing) await api(`/api/pos/${shop.id}/services/${editing.id}`, { method: "PATCH", body });
      await mutate();
      toast.push("success", "Service saved.");
      setEditing(null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: Service) {
    try {
      await api(`/api/pos/${shop.id}/services/${s.id}`, { method: "PATCH", body: { isActive: !s.isActive } });
      await mutate();
    } catch (e) {
      toast.push("error", errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Service catalog"
        description="What customers can pick when booking. Hide a service to stop offering it."
        action={
          <Button size="sm" onClick={() => open("new")}>
            <Plus className="h-4 w-4" aria-hidden /> Add service
          </Button>
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : services.length === 0 ? (
        <EmptyState icon={<Wrench className="h-8 w-8" aria-hidden />} title="No services yet" description="Add services like oil change or brake inspection." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.name} {!s.isActive && <Badge tone="neutral" className="ml-1">Hidden</Badge>}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {s.description ? `${s.description} · ` : ""}
                    <span className="tabular">{s.durationMin} min{s.basePrice ? ` · from ${money(s.basePrice)}` : ""}</span>
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => toggle(s)}>
                  {s.isActive ? "Hide" : "Show"}
                </Button>
                <Button variant="ghost" size="sm" aria-label={`Edit ${s.name}`} onClick={() => open(s)}>
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add a service" : "Edit service"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="sv-name" required className="sm:col-span-2">
            <Input id="sv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="sv-desc" className="sm:col-span-2">
            <Textarea id="sv-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />
          </Field>
          <Field label="Estimated duration (min)" htmlFor="sv-dur" required>
            <Input id="sv-dur" type="number" inputMode="numeric" min={15} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />
          </Field>
          <Field label="Base price (PKR)" htmlFor="sv-price" hint="Optional">
            <Input id="sv-price" type="number" inputMode="numeric" min={0} value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value === "" ? "" : Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-3">
          <InlineError>{err}</InlineError>
        </div>
      </Modal>
    </div>
  );
}
