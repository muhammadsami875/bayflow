"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Plus, UserPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { usePos } from "@/components/pos/pos-context";
import { useToast } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, InlineError, Input, ListSkeleton, PageHeader, Select } from "@/components/ui";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { ROLE_LABEL, STAFF_ROLES } from "@/lib/constants";

type StaffRole = (typeof STAFF_ROLES)[number];
interface Member {
  id: string;
  userId: string;
  role: StaffRole;
  isActive: boolean;
  name: string;
  email?: string;
  phone?: string | null;
}

const BLANK = { name: "", email: "", phone: "", password: "", role: "TECHNICIAN" as StaffRole };

export default function TeamPage({ params }: { params: Promise<{ shopId: string }> }) {
  use(params);
  const { shop } = usePos();
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ members: Member[] }>(`/api/pos/${shop.id}/team`);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const members = data?.members ?? [];

  async function add() {
    setBusy(true);
    setErr("");
    setErrors({});
    try {
      await api(`/api/pos/${shop.id}/team`, {
        method: "POST",
        body: { ...form, phone: form.phone || undefined, password: form.password || undefined },
      });
      await mutate();
      toast.push("success", `${form.name} added as ${ROLE_LABEL[form.role]}.`);
      setOpen(false);
      setForm(BLANK);
    } catch (e) {
      if (e instanceof ApiClientError && e.details) {
        setErrors(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v?.[0] ?? ""])));
      }
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function patch(m: Member, body: { role?: StaffRole; isActive?: boolean }, msg: string) {
    try {
      await api(`/api/pos/${shop.id}/team/${m.id}`, { method: "PATCH", body });
      await mutate();
      toast.push("success", msg);
    } catch (e) {
      toast.push("error", errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description={`Roles are set per shop. Staff of ${shop.name} only ever see this shop's work.`}
        action={
          <Button size="sm" onClick={() => { setErr(""); setErrors({}); setOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden /> Add team member
          </Button>
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : members.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-8 w-8" aria-hidden />}
          title="No team yet"
          description="Add a Service Advisor, Technician, QC Inspector and Parts Person to run the full workflow."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {m.name} {!m.isActive && <Badge tone="danger" className="ml-1">Inactive</Badge>}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{m.email}</p>
                </div>
                <div className="w-44">
                  <label htmlFor={`role-${m.id}`} className="sr-only">
                    Role for {m.name}
                  </label>
                  <Select
                    id={`role-${m.id}`}
                    value={m.role}
                    onChange={(e) => patch(m, { role: e.target.value as StaffRole }, "Role updated.")}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => patch(m, { isActive: !m.isActive }, m.isActive ? "Team member deactivated." : "Team member reactivated.")}
                >
                  {m.isActive ? "Deactivate" : "Reactivate"}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add team member"
        description="Creates their login. If they already work at another of your shops, they just gain a role here."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={add}>
              Add member
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="t-name" required error={errors.name}>
            <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} />
          </Field>
          <Field label="Role" htmlFor="t-role" required>
            <Select id="t-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Email" htmlFor="t-email" required error={errors.email}>
            <Input id="t-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} />
          </Field>
          <Field label="Initial password" htmlFor="t-pass" hint="Not needed for existing staff" error={errors.password}>
            <Input id="t-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} />
          </Field>
          <Field label="Phone" htmlFor="t-phone" hint="Optional" className="sm:col-span-2" error={errors.phone}>
            <Input id="t-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} invalid={!!errors.phone} />
          </Field>
        </div>
        <div className="mt-3">
          <InlineError>{err}</InlineError>
        </div>
      </Modal>
    </div>
  );
}
