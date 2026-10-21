"use client";

import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Car, CheckCircle2, PartyPopper, ReceiptText, Wrench } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { EstimateTable, formatDateTime, formatSlot, ProgressTimeline, useAuthGuard } from "@/components/booking-bits";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/providers";
import { Badge, Button, Callout, Card, CardHeader, Field, InlineError, KeyValue, ListSkeleton, StatusBadge, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { STATUS_META } from "@/lib/constants";
import { CANCELLABLE, type BookingStatus } from "@/lib/state-machine";

interface Estimate {
  id: string;
  version: number;
  revision: number;
  status: "SENT" | "APPROVED" | "REJECTED" | "DRAFT";
  diagnosis: string | null;
  customerNote: string | null;
  total: number;
  sentAt: string | null;
  respondedAt: string | null;
  lines: { id: string; kind: "PART" | "LABOUR"; description: string; quantity: number; unitCost: number }[];
}

interface BookingDetail {
  id: string;
  ref: string;
  status: BookingStatus;
  slotDate: string;
  slotTime: string;
  notes: string | null;
  readyNotifiedAt: string | null;
  cancelReason: string | null;
  shop: { name: string; city: string };
  vehicle: { make: string; model: string; year: number; regNo: string; color: string | null };
  services: { id: string; name: string }[];
  technicianName: string | null;
  estimates: Estimate[];
  events: { id: string; toStatus: BookingStatus; createdAt: string }[];
}

type Action = "APPROVE_ESTIMATE" | "REJECT_ESTIMATE" | "CANCEL" | "COMPLETE";

export default function CustomerBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ready } = useAuthGuard("CUSTOMER");
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<{ booking: BookingDetail }>(
    ready ? `/api/me/bookings/${id}` : null,
    { refreshInterval: 15_000 },
  );
  const [busy, setBusy] = useState<Action | null>(null);
  const [dialog, setDialog] = useState<"reject" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");

  const b = data?.booking;
  const current = b?.estimates.find((e) => e.status === "SENT") ?? b?.estimates[0];

  async function run(action: Action, body: Record<string, unknown> = {}, success: string) {
    setBusy(action);
    setActionError("");
    try {
      await api(`/api/me/bookings/${id}/actions`, { method: "POST", body: { action, ...body } });
      await mutate();
      toast.push("success", success);
      setDialog(null);
      setNote("");
    } catch (err) {
      setActionError(errorMessage(err));
      toast.push("error", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-4xl py-8 sm:py-12">
        <Link href="/account" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> My bookings
        </Link>

        {isLoading || !ready ? (
          <ListSkeleton rows={3} />
        ) : error || !b ? (
          <Card className="p-8 text-center">
            <h1 className="text-xl">Booking not found</h1>
            <p className="mt-2 text-ink-soft">It may belong to a different account.</p>
          </Card>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl">
                  {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
                </h1>
                <p className="mt-1 text-sm text-ink-soft">
                  {b.shop.name}, {b.shop.city} · <span className="font-mono">{b.ref}</span>
                </p>
              </div>
              <StatusBadge status={b.status} />
            </div>

            {b.status === "AWAITING_CUSTOMER" && current?.status === "SENT" && (
              <div className="mb-5">
                <Callout tone="warn" icon={<ReceiptText className="h-6 w-6 shrink-0" aria-hidden />} title="Your estimate is waiting for approval">
                  Review the itemized estimate below. Nothing is repaired until you approve.
                </Callout>
              </div>
            )}
            {b.status === "READY_FOR_PICKUP" && b.readyNotifiedAt && (
              <div className="mb-5">
                <Callout
                  tone="accent"
                  icon={<PartyPopper className="h-6 w-6 shrink-0" aria-hidden />}
                  title="Your vehicle is ready for pick-up"
                  action={
                    <Button variant="success" size="sm" loading={busy === "COMPLETE"} onClick={() => run("COMPLETE", {}, "Booking completed. Thank you!")}>
                      I picked it up
                    </Button>
                  }
                >
                  It passed our quality check. Collect it from {b.shop.name} and tap the button once you have it.
                </Callout>
              </div>
            )}
            {b.status === "ESTIMATE_REJECTED" && (
              <div className="mb-5">
                <Callout tone="danger" title="You rejected the estimate">
                  The shop will revise it or contact you.
                </Callout>
              </div>
            )}
            {b.status === "COMPLETED" && (
              <div className="mb-5">
                <Callout tone="accent" icon={<CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />} title="Completed">
                  Thanks for choosing {b.shop.name}.
                </Callout>
              </div>
            )}
            <InlineError>{actionError}</InlineError>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem]">
              <div className="space-y-5">
                {current && current.status !== "DRAFT" && (
                  <Card>
                    <CardHeader
                      title={
                        <span className="flex flex-wrap items-center gap-2">
                          Estimate
                          <Badge tone={current.status === "APPROVED" ? "accent" : current.status === "REJECTED" ? "danger" : "warn"}>
                            {current.status === "SENT" ? "Awaiting your decision" : current.status === "APPROVED" ? "Approved" : "Rejected"}
                          </Badge>
                        </span>
                      }
                      description={
                        <>
                          Version {current.version}
                          {current.revision > 0 ? `, revised by the shop` : ""}
                          {current.sentAt ? ` · sent ${formatDateTime(current.sentAt)}` : ""}
                        </>
                      }
                    />
                    <div className="space-y-4 p-5">
                      {current.diagnosis && (
                        <div>
                          <p className="eyebrow mb-1">Diagnosis</p>
                          <p className="text-sm">{current.diagnosis}</p>
                        </div>
                      )}
                      <EstimateTable lines={current.lines} total={current.total} />
                      {current.respondedAt && (
                        <p className="text-sm text-ink-soft">
                          You {current.status === "APPROVED" ? "approved" : "rejected"} this on {formatDateTime(current.respondedAt)}.
                          {current.customerNote ? ` Your note: “${current.customerNote}”` : ""}
                        </p>
                      )}
                      {b.status === "AWAITING_CUSTOMER" && current.status === "SENT" && (
                        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
                          <Button variant="success" className="flex-1" loading={busy === "APPROVE_ESTIMATE"} onClick={() => run("APPROVE_ESTIMATE", {}, "Estimate approved. The shop has been notified.")}>
                            Approve estimate
                          </Button>
                          <Button variant="secondary" className="flex-1" onClick={() => setDialog("reject")}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                <Card>
                  <CardHeader title="Booking details" />
                  <dl className="grid gap-4 p-5 sm:grid-cols-2">
                    <KeyValue label="Appointment">
                      <span className="tabular">{formatSlot(b.slotDate, b.slotTime)}</span>
                    </KeyValue>
                    <KeyValue label="Vehicle">
                      <span className="flex items-center gap-1.5">
                        <Car className="h-4 w-4 text-ink-soft" aria-hidden />
                        <span className="font-mono">{b.vehicle.regNo}</span>
                        {b.vehicle.color ? ` · ${b.vehicle.color}` : ""}
                      </span>
                    </KeyValue>
                    <KeyValue label="Problems reported">
                      <ul className="list-disc pl-4">
                        {b.services.map((s) => (
                          <li key={s.id}>{s.name}</li>
                        ))}
                      </ul>
                    </KeyValue>
                    <KeyValue label="Your notes">{b.notes ?? "None"}</KeyValue>
                    {b.technicianName && (
                      <KeyValue label="Technician">
                        <span className="flex items-center gap-1.5">
                          <Wrench className="h-4 w-4 text-ink-soft" aria-hidden /> {b.technicianName}
                        </span>
                      </KeyValue>
                    )}
                    {b.cancelReason && <KeyValue label="Cancellation reason">{b.cancelReason}</KeyValue>}
                  </dl>
                </Card>

                {CANCELLABLE.includes(b.status) && (
                  <div className="text-right">
                    <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setDialog("cancel")}>
                      Cancel this booking
                    </Button>
                  </div>
                )}
              </div>

              <Card className="h-fit">
                <CardHeader title="Progress" description={STATUS_META[b.status].customerHint} />
                <div className="p-5">
                  <ProgressTimeline status={b.status} events={b.events} />
                </div>
              </Card>
            </div>
          </>
        )}
      </main>

      <Modal
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Reject this estimate?"
        description="The shop will be told and can revise the estimate with the technician."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Keep reviewing
            </Button>
            <Button variant="danger" loading={busy === "REJECT_ESTIMATE"} onClick={() => run("REJECT_ESTIMATE", { note: note || undefined }, "Estimate rejected.")}>
              Reject estimate
            </Button>
          </>
        }
      >
        <Field label="What should change? (optional)" htmlFor="reject-note">
          <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <div className="mt-3">
          <InlineError>{actionError}</InlineError>
        </div>
      </Modal>

      <Modal
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="Cancel this booking?"
        description="Your slot is released. You can always book again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Keep booking
            </Button>
            <Button variant="danger" loading={busy === "CANCEL"} onClick={() => run("CANCEL", { note: note || undefined }, "Booking cancelled.")}>
              Cancel booking
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)" htmlFor="cancel-note">
          <Textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <div className="mt-3">
          <InlineError>{actionError}</InlineError>
        </div>
      </Modal>
    </>
  );
}
