"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { formatDateTime } from "@/components/booking-bits";
import { Modal } from "@/components/modal";
import { ReceiveDialog } from "@/components/pos/booking-detail";
import { usePos } from "@/components/pos/pos-context";
import { useToast } from "@/components/providers";
import { Badge, Button, Card, EmptyState, Field, InlineError, Input, ListSkeleton, PageHeader, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

interface Order {
  id: string;
  number: string;
  status: "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED";
  supplier: string | null;
  createdAt: string;
  booking: { ref: string } | null;
  items: {
    id: string;
    itemId: string;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
    item: { name: string; sku: string };
  }[];
}
interface Stock {
  id: string;
  name: string;
  sku: string;
  cost: number;
  quantity: number;
}

const TONE = { ORDERED: "brand", PARTIALLY_RECEIVED: "warn", RECEIVED: "accent" } as const;

export default function OrdersPage({ params }: { params: Promise<{ shopId: string }> }) {
  use(params);
  const { shop } = usePos();
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ orders: Order[] }>(`/api/pos/${shop.id}/purchase-orders`, { refreshInterval: 15_000 });
  const { data: stockData } = useSWR<{ items: Stock[] }>(`/api/pos/${shop.id}/inventory`);
  const [receiving, setReceiving] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [rows, setRows] = useState<{ itemId: string; quantity: number; unitCost: number }[]>([{ itemId: "", quantity: 1, unitCost: 0 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const orders = data?.orders ?? [];
  const stock = stockData?.items ?? [];

  async function create() {
    setBusy(true);
    setErr("");
    try {
      const items = rows.filter((r) => r.itemId);
      await api(`/api/pos/${shop.id}/purchase-orders`, { method: "POST", body: { supplier: supplier || undefined, items } });
      await mutate();
      toast.push("success", "Purchase order created.");
      setCreating(false);
      setRows([{ itemId: "", quantity: 1, unitCost: 0 }]);
      setSupplier("");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Orders linked to a booking come from the job screen. Create a restock order here."
        action={
          <Button size="sm" onClick={() => { setErr(""); setCreating(true); }}>
            <Plus className="h-4 w-4" aria-hidden /> New order
          </Button>
        }
      />
      {isLoading ? (
        <ListSkeleton />
      ) : orders.length === 0 ? (
        <EmptyState icon={<ShoppingCart className="h-8 w-8" aria-hidden />} title="No purchase orders yet" />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{o.number}</span>
                    <Badge tone={TONE[o.status]}>{o.status.replace("_", " ").toLowerCase()}</Badge>
                    {o.booking && <Badge tone="neutral">For {o.booking.ref}</Badge>}
                    <span className="text-sm text-ink-soft">
                      {o.supplier ? `${o.supplier} · ` : ""}
                      {formatDateTime(o.createdAt)}
                    </span>
                  </div>
                  {o.status !== "RECEIVED" && (
                    <Button size="sm" onClick={() => setReceiving(o)}>
                      Receive
                    </Button>
                  )}
                </div>
                <ul className="mt-3 divide-y divide-line text-sm">
                  {o.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {i.item.name} <span className="font-mono text-xs text-ink-soft">{i.item.sku}</span>
                      </span>
                      <span className="tabular text-ink-soft">
                        {i.quantityReceived}/{i.quantityOrdered} received
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ReceiveDialog
        open={!!receiving}
        orders={receiving ? [receiving] : []}
        shopId={shop.id}
        onClose={() => setReceiving(null)}
        onDone={async () => {
          await mutate();
          setReceiving(null);
        }}
      />

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        wide
        title="New purchase order"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={busy} onClick={create} disabled={!rows.some((r) => r.itemId)}>
              Place order
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Supplier" htmlFor="o-sup" hint="Optional">
            <Input id="o-sup" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          {rows.map((r, idx) => (
            <div key={idx} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_5.5rem_7.5rem_auto] sm:items-end">
              <Field label="Part" htmlFor={`o-i-${idx}`}>
                <Select
                  id={`o-i-${idx}`}
                  value={r.itemId}
                  onChange={(e) => {
                    const s = stock.find((x) => x.id === e.target.value);
                    setRows(rows.map((x, j) => (j === idx ? { ...x, itemId: e.target.value, unitCost: s?.cost ?? 0 } : x)));
                  }}
                >
                  <option value="">Choose a part</option>
                  {stock.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.quantity} in stock)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Qty" htmlFor={`o-q-${idx}`}>
                <Input id={`o-q-${idx}`} type="number" inputMode="numeric" min={1} value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
              </Field>
              <Field label="Unit cost" htmlFor={`o-c-${idx}`}>
                <Input id={`o-c-${idx}`} type="number" inputMode="numeric" min={0} value={r.unitCost} onChange={(e) => setRows(rows.map((x, j) => (j === idx ? { ...x, unitCost: Number(e.target.value) } : x)))} />
              </Field>
              <Button variant="ghost" size="sm" aria-label="Remove row" className="h-11 w-11" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== idx))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { itemId: "", quantity: 1, unitCost: 0 }])}>
            <Plus className="h-4 w-4" aria-hidden /> Add another part
          </Button>
          <InlineError>{err}</InlineError>
        </div>
      </Modal>
    </div>
  );
}
