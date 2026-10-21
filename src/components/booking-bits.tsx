"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CheckCircle2, CircleDot, XCircle } from "lucide-react";
import { useMe } from "./providers";
import { money } from "@/lib/constants";
import { TIMELINE_STEPS, timelineIndex, type BookingStatus } from "@/lib/state-machine";

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSlot(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${label}, ${time}`;
}

/** Redirects to /login (preserving the target) if signed out, or away if the wrong account type. */
export function useAuthGuard(kind: "CUSTOMER" | "STAFF") {
  const { me, loading } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    const here = typeof window === "undefined" ? "/" : window.location.pathname;
    if (!me?.user) router.replace(`/login?next=${encodeURIComponent(here)}`);
    else if (kind === "CUSTOMER" && me.user.type !== "CUSTOMER") router.replace("/pos");
    else if (kind === "STAFF" && me.user.type === "CUSTOMER") router.replace("/account");
  }, [loading, me, kind, router]);
  const allowed =
    !!me?.user && (kind === "CUSTOMER" ? me.user.type === "CUSTOMER" : me.user.type !== "CUSTOMER");
  return { me, ready: !loading && allowed };
}

/** Customer-facing progress through the nine milestones. */
export function ProgressTimeline({
  status,
  events,
}: {
  status: BookingStatus;
  events: { toStatus: BookingStatus; createdAt: string }[];
}) {
  if (status === "CANCELLED") {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-4 py-3 text-danger">
        <XCircle className="h-5 w-5" aria-hidden /> This booking was cancelled.
      </p>
    );
  }
  const current = status === "COMPLETED" ? TIMELINE_STEPS.length : timelineIndex(status);
  return (
    <ol className="space-y-0">
      {TIMELINE_STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "now" : "todo";
        const at = [...events].reverse().find((e) => step.statuses.includes(e.toStatus));
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < TIMELINE_STEPS.length - 1 && (
              <span
                aria-hidden
                className={clsx("absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5", state === "done" ? "bg-accent" : "bg-line")}
              />
            )}
            {state === "done" ? (
              <CheckCircle2 className="relative h-6 w-6 shrink-0 bg-surface text-accent" aria-hidden />
            ) : state === "now" ? (
              <CircleDot className="relative h-6 w-6 shrink-0 bg-surface text-brand" aria-hidden />
            ) : (
              <span className="relative m-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-line bg-surface" aria-hidden />
            )}
            <div className="-mt-0.5">
              <p className={clsx("font-medium", state === "todo" && "text-ink-soft", state === "now" && "text-brand-strong")}>
                {step.label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "now" ? " (current step)" : " (upcoming)"}</span>
              </p>
              {at && state !== "todo" && <p className="tabular text-xs text-ink-soft">{formatDateTime(at.createdAt)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface EstimateLineView {
  id: string;
  kind: "PART" | "LABOUR";
  description: string;
  quantity: number;
  unitCost: number;
}

/** Itemized, read-only estimate: parts and labour with totals. */
export function EstimateTable({ lines, total }: { lines: EstimateLineView[]; total: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <caption className="sr-only">Itemized estimate</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
            <th scope="col" className="py-2 pr-3 font-medium">Item</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Qty</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Unit</th>
            <th scope="col" className="py-2 pl-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="py-2.5 pr-3">
                {l.description}
                <span className="ml-2 text-xs text-ink-soft">{l.kind === "PART" ? "Part" : "Labour"}</span>
              </td>
              <td className="tabular px-3 py-2.5 text-right">{l.quantity}</td>
              <td className="tabular px-3 py-2.5 text-right">{money(l.unitCost)}</td>
              <td className="tabular py-2.5 pl-3 text-right font-medium">{money(l.quantity * l.unitCost)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line">
            <th scope="row" colSpan={3} className="py-3 text-right text-sm font-semibold">
              Total
            </th>
            <td className="tabular py-3 pl-3 text-right text-base font-semibold">{money(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
