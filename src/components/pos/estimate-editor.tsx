"use client";

import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, InlineError, Input, Textarea } from "../ui";
import { money } from "@/lib/constants";

export interface StockItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  cost: number;
}

export interface EditorLine {
  key: string;
  kind: "PART" | "LABOUR";
  description: string;
  itemId?: string | null;
  quantity: number;
  unitCost: number;
}

let counter = 0;
const newKey = () => `l${++counter}`;

export function toEditorLines(
  lines: { kind: "PART" | "LABOUR"; description: string; itemId?: string | null; quantity: number; unitCost: number }[],
): EditorLine[] {
  return lines.map((l) => ({ ...l, key: newKey() }));
}

/**
 * Line-item editor for parts and labour. Part names autocomplete from the shop's stock;
 * picking a stocked part links the line to inventory so shortages can be computed later.
 */
export function EstimateEditor({
  initialLines,
  initialDiagnosis,
  stock,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  initialLines: EditorLine[];
  initialDiagnosis: string;
  stock: StockItem[];
  primaryLabel: string;
  onPrimary: (lines: EditorLine[], diagnosis: string) => Promise<void>;
  secondaryLabel?: string;
  onSecondary?: (lines: EditorLine[], diagnosis: string) => Promise<void>;
}) {
  const listId = useId();
  const [lines, setLines] = useState<EditorLine[]>(
    initialLines.length ? initialLines : [{ key: newKey(), kind: "PART", description: "", quantity: 1, unitCost: 0 }],
  );
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis);
  const [busy, setBusy] = useState<"primary" | "secondary" | null>(null);
  const [error, setError] = useState("");

  const total = useMemo(() => lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitCost || 0), 0), [lines]);
  const byName = useMemo(() => new Map(stock.map((s) => [s.name.toLowerCase(), s])), [stock]);

  const update = (key: string, patch: Partial<EditorLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function onDescription(line: EditorLine, value: string) {
    const match = line.kind === "PART" ? byName.get(value.toLowerCase()) : undefined;
    update(line.key, {
      description: value,
      itemId: match?.id ?? null,
      ...(match && !line.unitCost ? { unitCost: match.cost } : {}),
    });
  }

  function clean() {
    const filled = lines.filter((l) => l.description.trim());
    if (filled.some((l) => !(l.quantity >= 1))) throw new Error("Quantity must be at least 1.");
    if (filled.some((l) => l.unitCost < 0)) throw new Error("Costs cannot be negative.");
    return filled;
  }

  async function run(which: "primary" | "secondary", fn: typeof onPrimary) {
    setError("");
    setBusy(which);
    try {
      const filled = clean();
      if (which === "primary" && filled.length === 0) throw new Error("Add at least one part or labour line.");
      await fn(filled, diagnosis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Diagnosis" htmlFor="diagnosis" hint="What did you find? The customer sees this.">
        <Textarea id="diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} maxLength={1000} />
      </Field>

      <datalist id={listId}>
        {stock.map((s) => (
          <option key={s.id} value={s.name}>
            {s.quantity} in stock
          </option>
        ))}
      </datalist>

      <div className="space-y-3">
        {lines.map((l, idx) => {
          const item = l.itemId ? stock.find((s) => s.id === l.itemId) : undefined;
          return (
            <fieldset key={l.key} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-xs font-medium text-ink-soft">
                {l.kind === "PART" ? "Part" : "Labour"} {idx + 1}
              </legend>
              <div className="grid gap-3 sm:grid-cols-[1fr_5rem_8rem_auto] sm:items-end">
                <Field label={l.kind === "PART" ? "Part" : "Description"} htmlFor={`d-${l.key}`}>
                  <Input
                    id={`d-${l.key}`}
                    value={l.description}
                    list={l.kind === "PART" ? listId : undefined}
                    onChange={(e) => onDescription(l, e.target.value)}
                    placeholder={l.kind === "PART" ? "Search stock or type a new part" : "e.g. Diagnostic and repair labour"}
                  />
                </Field>
                <Field label={l.kind === "LABOUR" ? "Hours" : "Qty"} htmlFor={`q-${l.key}`}>
                  <Input
                    id={`q-${l.key}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Unit cost (PKR)" htmlFor={`c-${l.key}`}>
                  <Input
                    id={`c-${l.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={l.unitCost}
                    onChange={(e) => update(l.key, { unitCost: Number(e.target.value) })}
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove line ${idx + 1}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="h-11 w-11 text-ink-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-ink-soft">
                {l.kind === "PART" ? (
                  item ? (
                    <span>
                      {item.sku} · <span className={item.quantity < l.quantity ? "font-medium text-warn" : ""}>{item.quantity} in stock</span>
                    </span>
                  ) : l.description ? (
                    <span>Not in stock list. It will be added as a part to order.</span>
                  ) : (
                    <span />
                  )
                ) : (
                  <span />
                )}
                <span className="tabular font-medium text-ink">{money((l.quantity || 0) * (l.unitCost || 0))}</span>
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: "PART", description: "", quantity: 1, unitCost: 0 }])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add part
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: "LABOUR", description: "Labour", quantity: 1, unitCost: 0 }])}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add labour
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
        <span className="font-medium">Estimate total</span>
        <span className="tabular text-xl font-semibold">{money(total)}</span>
      </div>

      <InlineError>{error}</InlineError>

      <div className="flex flex-wrap gap-2">
        <Button loading={busy === "primary"} disabled={busy !== null} onClick={() => run("primary", onPrimary)}>
          {primaryLabel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="secondary" loading={busy === "secondary"} disabled={busy !== null} onClick={() => run("secondary", onSecondary)}>
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
