"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Boxes, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import { usePos } from "@/components/pos/pos-context";
import { useToast } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, InlineError, Input, ListSkeleton, PageHeader } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/constants";

interface Item {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  reorderLevel: number;
  cost: number;
}

const BLANK = { sku: "", name: "", quantity: 0, reorderLevel: 0, cost: 0 };

export default function InventoryPage({ params }: { params: Promise<{ shopId: string }> }) {
  use(params);
  const { shop, role } = usePos();
  const toast = useToast();
  const canEdit = role === "OWNER" || role === "PARTS_PERSON";
  const { data, isLoading, mutate } = useSWR<{ items: Item[] }>(`/api/pos/${shop.id}/inventory`, { refreshInterval: 15_000 });
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const items = data?.items ?? [];
  const low = items.filter((i) => i.quantity <= i.reorderLevel);

  function open(item: Item | "new") {
    setErr("");
    setForm(item === "new" ? BLANK : { sku: item.sku, name: item.name, quantity: item.quantity, reorderLevel: item.reorderLevel, cost: item.cost });
    setEditing(item);
  }

  async function save() {
    setBusy(true);
    setErr("");
    try {
      if (editing === "new") await api(`/api/pos/${shop.id}/inventory`, { method: "POST", body: form });
      else if (editing) await api(`/api/pos/${shop.id}/inventory/${editing.id}`, { method: "PATCH", body: form });
      await mutate();
      toast.push("success", editing === "new" ? "Part added." : "Part updated.");
      setEditing(null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const num = (k: "quantity" | "reorderLevel" | "cost") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: Number(e.target.value) });

  return (
    <div>
      <PageHeader
        title="Inventory"
        description={`${items.length} parts${low.length ? ` · ${low.length} at or below reorder level` : ""}`}
        action={
          canEdit && (
            <Button size="sm" onClick={() => open("new")}>
              <Plus className="h-4 w-4" aria-hidden /> Add part
            </Button>
          )
        }
      />
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Boxes className="h-8 w-8" aria-hidden />} title="No parts yet" description="Add the parts you stock so shortages can be spotted at estimate time." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Parts inventory</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th scope="col" className="px-5 py-3 font-medium">SKU</th>
                  <th scope="col" className="px-3 py-3 font-medium">Part</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">On hand</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Reorder at</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Cost</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  {canEdit && <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((i) => {
                  const isLow = i.quantity <= i.reorderLevel;
                  return (
                    <tr key={i.id}>
                      <td className="px-5 py-3 font-mono text-xs">{i.sku}</td>
                      <td className="px-3 py-3 font-medium">{i.name}</td>
                      <td className="tabular px-3 py-3 text-right">{i.quantity}</td>
                      <td className="tabular px-3 py-3 text-right text-ink-soft">{i.reorderLevel}</td>
                      <td className="tabular px-3 py-3 text-right">{money(i.cost)}</td>
                      <td className="px-3 py-3">
                        {i.quantity === 0 ? <Badge tone="danger">Out of stock</Badge> : isLow ? <Badge tone="warn">Low</Badge> : <Badge tone="accent">OK</Badge>}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3 text-right">
                          <Button variant="ghost" size="sm" aria-label={`Edit ${i.name}`} onClick={() => open(i)}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add a part" : "Edit part"}
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
          <Field label="SKU" htmlFor="i-sku" required>
            <Input id="i-sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="font-mono uppercase" />
          </Field>
          <Field label="Part name" htmlFor="i-name" required>
            <Input id="i-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Quantity on hand" htmlFor="i-qty">
            <Input id="i-qty" type="number" inputMode="numeric" min={0} value={form.quantity} onChange={num("quantity")} />
          </Field>
          <Field label="Reorder level" htmlFor="i-re">
            <Input id="i-re" type="number" inputMode="numeric" min={0} value={form.reorderLevel} onChange={num("reorderLevel")} />
          </Field>
          <Field label="Unit cost (PKR)" htmlFor="i-cost">
            <Input id="i-cost" type="number" inputMode="numeric" min={0} value={form.cost} onChange={num("cost")} />
          </Field>
        </div>
        <div className="mt-3">
          <InlineError>{err}</InlineError>
        </div>
      </Modal>
    </div>
  );
}
