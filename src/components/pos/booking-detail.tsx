"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Hourglass,
  PackageCheck,
  PhoneCall,
  Truck,
} from "lucide-react";
import { EstimateTable, formatDateTime, formatSlot } from "../booking-bits";
import { Modal } from "../modal";
import { useToast } from "../providers";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  Field,
  InlineError,
  Input,
  KeyValue,
  ListSkeleton,
  Select,
  StatusBadge,
  Textarea,
} from "../ui";
import { EstimateEditor, toEditorLines, type EditorLine, type StockItem } from "./estimate-editor";
import { posPath, usePos } from "./pos-context";
import { api, errorMessage } from "@/lib/api";
import { money, STATUS_META } from "@/lib/constants";
import { CANCELLABLE, checkTransition, type BookingAction, type BookingStatus } from "@/lib/state-machine";

interface Line {
  id: string;
  kind: "PART" | "LABOUR";
  description: string;
  itemId: string | null;
  quantity: number;
  unitCost: number;
}
interface Estimate {
  id: string;
  version: number;
  revision: number;
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
  diagnosis: string | null;
  customerNote: string | null;
  total: number;
  sentAt: string | null;
  respondedAt: string | null;
  lines: Line[];
}
interface PartNeed {
  itemId: string;
  sku: string;
  name: string;
  unitCost: number;
  required: number;
  onHand: number;
  shortage: number;
}
interface PoItem {
  id: string;
  itemId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  item: { name: string; sku: string };
}
interface Detail {
  id: string;
  ref: string;
  status: BookingStatus;
  slotDate: string;
  slotTime: string;
  notes: string | null;
  mileageAtBooking: number | null;
  technicianId: string | null;
  partsPersonId: string | null;
  qcInspectorId: string | null;
  readyNotifiedAt: string | null;
  cancelReason: string | null;
  technicianName: string | null;
  partsPersonName: string | null;
  qcInspectorName: string | null;
  customer: { name: string; email: string; phone: string | null };
  vehicle: { make: string; model: string; year: number; regNo: string; color: string | null; mileage: number | null };
  services: { id: string; name: string }[];
  estimates: Estimate[];
  events: { id: string; actorName: string; actorRole: string; action: string; fromStatus: BookingStatus | null; toStatus: BookingStatus; note: string | null; createdAt: string }[];
  issues: { id: string; title: string; description: string; raisedByName: string; resolvedAt: string | null; createdAt: string }[];
  orders: { id: string; number: string; status: string; supplier: string | null; items: PoItem[] }[];
  partNeeds: PartNeed[];
}

type Payload = { action: BookingAction } & Record<string, unknown>;

const stripLines = (lines: EditorLine[]) =>
  lines.map((l) => ({
    kind: l.kind,
    description: l.description.trim(),
    itemId: l.itemId || undefined,
    quantity: l.quantity,
    unitCost: l.unitCost,
  }));

export function BookingDetailView({ bookingId }: { bookingId: string }) {
  const { shop, role, user } = usePos();
  const toast = useToast();
  const base = `/api/pos/${shop.id}`;
  const { data, error, isLoading, mutate } = useSWR<{ booking: Detail }>(`${base}/bookings/${bookingId}`, {
    refreshInterval: 10_000,
  });
  const b = data?.booking;

  const isSa = role === "OWNER" || role === "SERVICE_ADVISOR";
  const { data: teamData } = useSWR<{ members: { userId: string; name: string; role: string; isActive: boolean }[] }>(
    isSa ? `${base}/team` : null,
  );
  const needsStock = !!b && ["INSPECTING", "ESTIMATE_REVIEW"].includes(b.status) && (role === "TECHNICIAN" || isSa);
  const { data: stockData } = useSWR<{ items: StockItem[] }>(needsStock ? `${base}/inventory` : null);

  const [dialog, setDialog] = useState<"decline" | "cancel" | "revise" | "po" | "receive" | "qcfail" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(payload: Payload, success: string) {
    setBusy(true);
    setErr("");
    try {
      await api(`${base}/bookings/${bookingId}/actions`, { method: "POST", body: payload });
      await mutate();
      toast.push("success", success);
      setDialog(null);
      setNote("");
    } catch (e) {
      setErr(errorMessage(e));
      toast.push("error", errorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const safeAct = (p: Payload, s: string) => act(p, s).catch(() => {});

  if (isLoading) return <ListSkeleton rows={4} />;
  if (error || !b) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl">Booking not found</h1>
        <p className="mt-2 text-ink-soft">It may not be assigned to you, or belong to another shop.</p>
        <Link href={posPath(shop.id)} className="mt-4 inline-block text-brand hover:underline">
          Back to dashboard
        </Link>
      </Card>
    );
  }

  const meIsTech = b.technicianId === user.id;
  const meIsParts = b.partsPersonId === user.id;
  const meIsQc = b.qcInspectorId === user.id;
  const can = (a: BookingAction) => checkTransition(a, b.status, role).ok;
  const latest = b.estimates[0];
  const staff = (teamData?.members ?? []).filter((m) => m.isActive);
  const technicians = staff.filter((m) => m.role === "TECHNICIAN");
  const partsPeople = staff.filter((m) => m.role === "PARTS_PERSON");
  const openIssues = b.issues.filter((i) => !i.resolvedAt);
  const shortages = b.partNeeds.filter((n) => n.shortage > 0);
  const orderedIssues = b.orders.filter((o) => o.status !== "RECEIVED");
  const stock = stockData?.items ?? [];

  return (
    <div>
      <Link href={posPath(shop.id, role === "OWNER" ? "/bookings" : "")} className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">
            {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            <span className="font-mono">{b.ref}</span> · {b.customer.name} · <span className="font-mono">{b.vehicle.regNo}</span>
          </p>
        </div>
        <div className="text-right">
          <StatusBadge status={b.status} />
          <p className="mt-1 text-xs text-ink-soft">With: {STATUS_META[b.status].owner}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-5">
          {/* ---------------------------------------------------- next step */}
          <Card>
            <CardHeader title="Next step" />
            <div className="space-y-4 p-5">
              <InlineError>{err}</InlineError>

              {b.status === "PENDING" &&
                (can("CONFIRM") ? (
                  <>
                    <p className="text-sm text-ink-soft">Review the request, then confirm the slot or decline it.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button loading={busy} onClick={() => safeAct({ action: "CONFIRM" }, "Booking confirmed.")}>
                        Confirm booking
                      </Button>
                      <Button variant="secondary" onClick={() => setDialog("decline")}>
                        Decline
                      </Button>
                    </div>
                  </>
                ) : (
                  <Waiting text="Waiting for the Service Advisor to confirm." />
                ))}

              {b.status === "CONFIRMED" &&
                (can("ASSIGN_TECHNICIAN") ? (
                  <AssignForm
                    label="Assign a technician"
                    options={technicians}
                    empty="There are no active technicians. Ask the owner to add one."
                    busy={busy}
                    onAssign={(id) => safeAct({ action: "ASSIGN_TECHNICIAN", technicianId: id }, "Technician assigned.")}
                  />
                ) : (
                  <Waiting text="Waiting for a technician to be assigned." />
                ))}

              {b.status === "ASSIGNED" &&
                (can("START_INSPECTION") && meIsTech ? (
                  <>
                    <p className="text-sm text-ink-soft">Inspect the vehicle, then record what you find and what it needs.</p>
                    <Button loading={busy} onClick={() => safeAct({ action: "START_INSPECTION" }, "Inspection started.")}>
                      Start inspection
                    </Button>
                  </>
                ) : (
                  <Waiting text={`Waiting for ${b.technicianName ?? "the technician"} to start the inspection.`} />
                ))}

              {b.status === "INSPECTING" &&
                (can("SUBMIT_ESTIMATE") && meIsTech ? (
                  <EstimateEditor
                    key={`tech-${latest?.id}-${latest?.version}`}
                    initialLines={toEditorLines(latest?.lines ?? [])}
                    initialDiagnosis={latest?.diagnosis ?? ""}
                    stock={stock}
                    primaryLabel="Submit estimate to Service Advisor"
                    onPrimary={(lines, diagnosis) =>
                      act({ action: "SUBMIT_ESTIMATE", lines: stripLines(lines), diagnosis }, "Estimate submitted for review.")
                    }
                    secondaryLabel="Save draft"
                    onSecondary={(lines, diagnosis) =>
                      act({ action: "SAVE_ESTIMATE", lines: stripLines(lines), diagnosis }, "Draft saved.")
                    }
                  />
                ) : (
                  <Waiting text={`${b.technicianName ?? "The technician"} is inspecting the vehicle.`} />
                ))}

              {b.status === "ESTIMATE_REVIEW" &&
                (can("EDIT_ESTIMATE") ? (
                  <>
                    <p className="text-sm text-ink-soft">
                      Review the technician&apos;s estimate. Adjust it if needed, then send it to the customer.
                      {latest && latest.revision > 0 ? ` Edited ${latest.revision} time${latest.revision > 1 ? "s" : ""} so far.` : ""}
                    </p>
                    <EstimateEditor
                      key={`sa-${latest?.id}-${latest?.revision}`}
                      initialLines={toEditorLines(latest?.lines ?? [])}
                      initialDiagnosis={latest?.diagnosis ?? ""}
                      stock={stock}
                      primaryLabel="Save changes"
                      onPrimary={(lines, diagnosis) =>
                        act({ action: "EDIT_ESTIMATE", lines: stripLines(lines), diagnosis }, "Estimate updated.")
                      }
                    />
                    <div className="border-t border-line pt-4">
                      <Button variant="success" loading={busy} onClick={() => safeAct({ action: "SEND_ESTIMATE" }, "Estimate sent to the customer.")}>
                        Send to customer
                      </Button>
                      <p className="mt-2 text-xs text-ink-soft">Save any edits first. The customer sees the saved version.</p>
                    </div>
                  </>
                ) : (
                  <Waiting text="The Service Advisor is reviewing the estimate." />
                ))}

              {b.status === "AWAITING_CUSTOMER" && <Waiting text={`Waiting for ${b.customer.name} to approve or reject the estimate.`} />}

              {b.status === "ESTIMATE_REJECTED" &&
                (can("REQUEST_REVISION") ? (
                  <>
                    <Callout tone="danger" title="The customer rejected this estimate">
                      {latest?.customerNote ? `“${latest.customerNote}”` : "No reason was given."}
                    </Callout>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setDialog("revise")}>Revise with technician</Button>
                      <Button variant="secondary" onClick={() => setDialog("cancel")}>
                        Cancel booking
                      </Button>
                    </div>
                  </>
                ) : (
                  <Waiting text="The Service Advisor is deciding how to handle the rejected estimate." />
                ))}

              {b.status === "ESTIMATE_APPROVED" &&
                (can("ASSIGN_PARTS_PERSON") ? (
                  <AssignForm
                    label="Assign a parts person"
                    options={partsPeople}
                    empty="There are no active parts people. Ask the owner to add one."
                    busy={busy}
                    onAssign={(id) => safeAct({ action: "ASSIGN_PARTS_PERSON", partsPersonId: id }, "Parts person assigned.")}
                  />
                ) : (
                  <Waiting text="Waiting for a parts person to be assigned." />
                ))}

              {(b.status === "PARTS_PENDING" || b.status === "PARTS_ORDERED") &&
                (role === "PARTS_PERSON" && meIsParts ? (
                  <PartsStep
                    b={b}
                    busy={busy}
                    shortages={shortages}
                    onOrder={() => setDialog("po")}
                    onReceive={() => setDialog("receive")}
                    onReady={() => safeAct({ action: "MARK_PARTS_READY" }, "Marked parts ready.")}
                  />
                ) : (
                  <Waiting
                    text={`${b.partsPersonName ?? "The parts person"} is ${
                      b.status === "PARTS_ORDERED" ? "waiting for ordered parts to arrive" : "checking stock"
                    }.`}
                  />
                ))}

              {b.status === "PARTS_READY" &&
                (can("ALLOCATE_PARTS") && meIsParts ? (
                  <>
                    <p className="text-sm text-ink-soft">All parts are in stock. Allocating deducts them from inventory and sends the job to the technician.</p>
                    <Button loading={busy} onClick={() => safeAct({ action: "ALLOCATE_PARTS" }, "Parts allocated. Job is in repair.")}>
                      <PackageCheck className="h-4 w-4" aria-hidden /> Allocate parts to this booking
                    </Button>
                  </>
                ) : (
                  <Waiting text="Waiting for the parts person to allocate parts." />
                ))}

              {b.status === "IN_REPAIR" &&
                (can("SEND_TO_QC") && meIsTech ? (
                  <>
                    {openIssues.length > 0 && (
                      <Callout tone="danger" icon={<AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />} title="QC sent this job back">
                        <ul className="mt-1 space-y-1">
                          {openIssues.map((i) => (
                            <li key={i.id}>
                              <strong>{i.title}.</strong> {i.description}
                            </li>
                          ))}
                        </ul>
                      </Callout>
                    )}
                    <p className="text-sm text-ink-soft">Complete the repair, then send it to the QC queue.</p>
                    <Field label="Notes for QC (optional)" htmlFor="qc-note">
                      <Textarea id="qc-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
                    </Field>
                    <Button loading={busy} onClick={() => safeAct({ action: "SEND_TO_QC", note: note || undefined }, "Sent to QC.")}>
                      Send to QC
                    </Button>
                  </>
                ) : (
                  <Waiting text={`${b.technicianName ?? "The technician"} is repairing the vehicle.`} />
                ))}

              {b.status === "QC_PENDING" &&
                (can("PICK_QC") ? (
                  <>
                    <p className="text-sm text-ink-soft">This job is in the shared QC queue. The first inspector to pick it locks it.</p>
                    <Button loading={busy} onClick={() => safeAct({ action: "PICK_QC" }, "You picked this job.")}>
                      <ClipboardCheck className="h-4 w-4" aria-hidden /> Pick this job
                    </Button>
                  </>
                ) : (
                  <Waiting text="Waiting in the QC queue." />
                ))}

              {b.status === "QC_IN_PROGRESS" &&
                (can("QC_PASS") && meIsQc ? (
                  <QcChecklist
                    busy={busy}
                    onPass={(n) => safeAct({ action: "QC_PASS", note: n || undefined }, "Passed QC. Sent to the Service Advisor.")}
                    onFail={() => setDialog("qcfail")}
                  />
                ) : (
                  <Waiting text={`${b.qcInspectorName ?? "An inspector"} is testing the vehicle.`} />
                ))}

              {b.status === "READY_FOR_PICKUP" &&
                (can("NOTIFY_READY") ? (
                  <>
                    <p className="text-sm text-ink-soft">
                      {b.readyNotifiedAt
                        ? `Customer notified ${formatDateTime(b.readyNotifiedAt)}. Complete the booking once they collect the vehicle.`
                        : "The vehicle passed QC. Tell the customer it is ready."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {!b.readyNotifiedAt && (
                        <Button loading={busy} onClick={() => safeAct({ action: "NOTIFY_READY" }, "Customer notified.")}>
                          Notify customer: ready for pick-up
                        </Button>
                      )}
                      <Button variant={b.readyNotifiedAt ? "success" : "secondary"} loading={busy} onClick={() => safeAct({ action: "COMPLETE" }, "Booking completed.")}>
                        Mark as collected and complete
                      </Button>
                    </div>
                  </>
                ) : (
                  <Waiting text="Waiting for the Service Advisor to hand the vehicle over." />
                ))}

              {b.status === "COMPLETED" && (
                <p className="flex items-center gap-2 text-accent">
                  <CheckCircle2 className="h-5 w-5" aria-hidden /> Completed. Nothing more to do.
                </p>
              )}
              {b.status === "CANCELLED" && (
                <p className="text-danger">Cancelled{b.cancelReason ? `: ${b.cancelReason}` : "."}</p>
              )}

              {can("CANCEL") && CANCELLABLE.includes(b.status) && !["ESTIMATE_REJECTED", "PENDING"].includes(b.status) && (
                <div className="border-t border-line pt-3">
                  <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setDialog("cancel")}>
                    Cancel booking
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* ---------------------------------------------------- estimate (read view) */}
          {latest && latest.lines.length > 0 && !["INSPECTING", "ESTIMATE_REVIEW"].includes(b.status) && (
            <Card>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    Estimate v{latest.version}
                    <Badge tone={latest.status === "APPROVED" ? "accent" : latest.status === "REJECTED" ? "danger" : latest.status === "SENT" ? "warn" : "neutral"}>
                      {latest.status === "DRAFT" ? "Draft" : latest.status === "SENT" ? "Sent" : latest.status === "APPROVED" ? "Approved" : "Rejected"}
                    </Badge>
                  </span>
                }
                description={
                  latest.respondedAt
                    ? `${latest.status === "APPROVED" ? "Approved" : "Rejected"} by the customer ${formatDateTime(latest.respondedAt)}`
                    : latest.sentAt
                      ? `Sent ${formatDateTime(latest.sentAt)}`
                      : undefined
                }
              />
              <div className="space-y-3 p-5">
                {latest.diagnosis && <p className="text-sm">{latest.diagnosis}</p>}
                <EstimateTable lines={latest.lines} total={latest.total} />
              </div>
            </Card>
          )}

          {/* ---------------------------------------------------- parts needs */}
          {b.partNeeds.length > 0 && (
            <Card>
              <CardHeader title="Parts: required vs available" description={shortages.length ? `${shortages.length} short` : "Everything required is in stock"} />
              <PartNeedsTable needs={b.partNeeds} />
            </Card>
          )}

          {/* ---------------------------------------------------- purchase orders */}
          {b.orders.length > 0 && (
            <Card>
              <CardHeader title="Purchase orders" />
              <ul className="divide-y divide-line">
                {b.orders.map((o) => (
                  <li key={o.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-medium">{o.number}</span>
                      <Badge tone={o.status === "RECEIVED" ? "accent" : o.status === "PARTIALLY_RECEIVED" ? "warn" : "brand"}>{o.status.replace("_", " ").toLowerCase()}</Badge>
                      {o.supplier && <span className="text-sm text-ink-soft">{o.supplier}</span>}
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {o.items.map((i) => (
                        <li key={i.id} className="flex justify-between gap-3">
                          <span>{i.item.name}</span>
                          <span className="tabular text-ink-soft">
                            {i.quantityReceived}/{i.quantityOrdered} received
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---------------------------------------------------- QC issues history */}
          {b.issues.length > 0 && (
            <Card>
              <CardHeader title="QC issues" />
              <ul className="divide-y divide-line">
                {b.issues.map((i) => (
                  <li key={i.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{i.title}</p>
                      <Badge tone={i.resolvedAt ? "accent" : "danger"}>{i.resolvedAt ? "Resolved" : "Open"}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-soft">{i.description}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Raised by {i.raisedByName} · {formatDateTime(i.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---------------------------------------------------- audit trail */}
          <Card>
            <CardHeader title="History" description="Every status change is recorded: who, when, from and to." />
            <ol className="divide-y divide-line">
              {[...b.events].reverse().map((e) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      <span className="font-medium">{e.actorName}</span> <span className="text-ink-soft">({e.actorRole})</span>
                    </p>
                    <time dateTime={e.createdAt} className="tabular text-xs text-ink-soft">
                      {formatDateTime(e.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-ink-soft">
                    {e.fromStatus ? (
                      e.fromStatus === e.toStatus ? (
                        <>
                          {e.action.replaceAll("_", " ").toLowerCase()} · <StatusBadge status={e.toStatus} />
                        </>
                      ) : (
                        <>
                          <StatusBadge status={e.fromStatus} /> <span aria-label="to">→</span> <StatusBadge status={e.toStatus} />
                        </>
                      )
                    ) : (
                      <>
                        created as <StatusBadge status={e.toStatus} />
                      </>
                    )}
                  </p>
                  {e.note && <p className="mt-1 text-ink-soft">“{e.note}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* ---------------------------------------------------- sidebar */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Customer" />
            <dl className="space-y-3 p-5">
              <KeyValue label="Name">{b.customer.name}</KeyValue>
              {isSa && (
                <>
                  <KeyValue label="Email">{b.customer.email}</KeyValue>
                  {b.customer.phone && (
                    <KeyValue label="Phone">
                      <span className="flex items-center gap-1.5">
                        <PhoneCall className="h-3.5 w-3.5 text-ink-soft" aria-hidden /> {b.customer.phone}
                      </span>
                    </KeyValue>
                  )}
                </>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Job" />
            <dl className="space-y-3 p-5">
              <KeyValue label="Appointment">
                <span className="tabular">{formatSlot(b.slotDate, b.slotTime)}</span>
              </KeyValue>
              <KeyValue label="Vehicle">
                {b.vehicle.year} {b.vehicle.make} {b.vehicle.model}
                <br />
                <span className="font-mono">{b.vehicle.regNo}</span>
                {b.vehicle.color ? ` · ${b.vehicle.color}` : ""}
                {(b.mileageAtBooking ?? b.vehicle.mileage) ? <span className="tabular"> · {(b.mileageAtBooking ?? b.vehicle.mileage)!.toLocaleString()} km</span> : null}
              </KeyValue>
              <KeyValue label="Reported problems">
                <ul className="list-disc pl-4">
                  {b.services.map((s) => (
                    <li key={s.id}>{s.name}</li>
                  ))}
                </ul>
              </KeyValue>
              <KeyValue label="Customer notes">{b.notes ?? "None"}</KeyValue>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Assigned team" />
            <dl className="space-y-3 p-5">
              <KeyValue label="Technician">{b.technicianName ?? "Not assigned"}</KeyValue>
              <KeyValue label="Parts person">{b.partsPersonName ?? "Not assigned"}</KeyValue>
              <KeyValue label="QC inspector">{b.qcInspectorName ?? "Not picked yet"}</KeyValue>
            </dl>
          </Card>
        </div>
      </div>

      {/* ---------------------------------------------------- dialogs */}
      <NoteDialog
        open={dialog === "decline"}
        title="Decline this booking?"
        description="The customer is notified and the slot is released."
        label="Reason (optional)"
        confirmLabel="Decline booking"
        danger
        busy={busy}
        error={err}
        note={note}
        setNote={setNote}
        onClose={() => setDialog(null)}
        onConfirm={() => safeAct({ action: "DECLINE", note: note || undefined }, "Booking declined.")}
      />
      <NoteDialog
        open={dialog === "cancel"}
        title="Cancel this booking?"
        description="The customer is notified, the slot is released and any reserved parts go back to stock."
        label="Reason (optional)"
        confirmLabel="Cancel booking"
        danger
        busy={busy}
        error={err}
        note={note}
        setNote={setNote}
        onClose={() => setDialog(null)}
        onConfirm={() => safeAct({ action: "CANCEL", note: note || undefined }, "Booking cancelled.")}
      />
      <NoteDialog
        open={dialog === "revise"}
        title="Send back to the technician?"
        description="The technician gets a new estimate version based on the rejected one."
        label="Note for the technician (optional)"
        confirmLabel="Request revision"
        busy={busy}
        error={err}
        note={note}
        setNote={setNote}
        onClose={() => setDialog(null)}
        onConfirm={() => safeAct({ action: "REQUEST_REVISION", note: note || undefined }, "Sent back for revision.")}
      />

      <QcFailDialog
        open={dialog === "qcfail"}
        busy={busy}
        error={err}
        onClose={() => setDialog(null)}
        onSubmit={(title, description) => safeAct({ action: "QC_FAIL", title, description }, "Issue raised. Job returned to the technician.")}
      />

      <PoDialog
        open={dialog === "po"}
        needs={shortages}
        busy={busy}
        error={err}
        onClose={() => setDialog(null)}
        onSubmit={(supplier, items) => safeAct({ action: "ORDER_PARTS", supplier: supplier || undefined, items }, "Purchase order created.")}
      />

      <ReceiveDialog
        open={dialog === "receive"}
        orders={orderedIssues}
        shopId={shop.id}
        onClose={() => setDialog(null)}
        onDone={async () => {
          await mutate();
          setDialog(null);
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ small pieces

function Waiting({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-ink-soft">
      <Hourglass className="h-4 w-4 shrink-0" aria-hidden /> {text}
    </p>
  );
}

function AssignForm({
  label,
  options,
  empty,
  busy,
  onAssign,
}: {
  label: string;
  options: { userId: string; name: string }[];
  empty: string;
  busy: boolean;
  onAssign: (userId: string) => void;
}) {
  const [pick, setPick] = useState("");
  if (options.length === 0) return <p className="text-sm text-warn">{empty}</p>;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={label} htmlFor="assign-select" className="min-w-52 flex-1">
        <Select id="assign-select" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Choose a person</option>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button disabled={!pick} loading={busy} onClick={() => onAssign(pick)}>
        Assign
      </Button>
    </div>
  );
}

function PartNeedsTable({ needs }: { needs: PartNeed[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] text-sm">
        <caption className="sr-only">Parts required versus available</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
            <th scope="col" className="px-5 py-2 font-medium">Part</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Required</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">On hand</th>
            <th scope="col" className="px-5 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {needs.map((n) => (
            <tr key={n.itemId}>
              <td className="px-5 py-2.5">
                {n.name}
                <span className="block font-mono text-xs text-ink-soft">{n.sku}</span>
              </td>
              <td className="tabular px-3 py-2.5 text-right">{n.required}</td>
              <td className="tabular px-3 py-2.5 text-right">{n.onHand}</td>
              <td className="px-5 py-2.5 text-right">
                {n.shortage > 0 ? <Badge tone="danger">Short {n.shortage}</Badge> : <Badge tone="accent">In stock</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PartsStep({
  b,
  busy,
  shortages,
  onOrder,
  onReceive,
  onReady,
}: {
  b: Detail;
  busy: boolean;
  shortages: PartNeed[];
  onOrder: () => void;
  onReceive: () => void;
  onReady: () => void;
}) {
  const open = b.orders.filter((o) => o.status !== "RECEIVED");
  if (b.status === "PARTS_ORDERED") {
    return (
      <>
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Truck className="h-4 w-4" aria-hidden /> Parts are on order. Confirm receipt when they arrive. A partial delivery keeps the job here.
        </p>
        <Button onClick={onReceive} disabled={open.length === 0}>
          Receive delivery
        </Button>
      </>
    );
  }
  return shortages.length > 0 ? (
    <>
      <p className="text-sm text-ink-soft">{shortages.length} part{shortages.length > 1 ? "s are" : " is"} short. Order what is missing.</p>
      <Button onClick={onOrder}>Create purchase order</Button>
    </>
  ) : (
    <>
      <p className="text-sm text-ink-soft">Everything required is already in stock, so no ordering is needed.</p>
      <Button loading={busy} onClick={onReady}>
        Mark parts ready
      </Button>
    </>
  );
}

function QcChecklist({ busy, onPass, onFail }: { busy: boolean; onPass: (note: string) => void; onFail: () => void }) {
  const items = ["Road test completed", "Repair matches the approved estimate", "No leaks, warning lights or unusual noises", "Vehicle clean and ready for the customer"];
  const [checked, setChecked] = useState<boolean[]>(items.map(() => false));
  const [note, setNote] = useState("");
  const all = checked.every(Boolean);
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">QC checklist</legend>
        <div className="space-y-2">
          {items.map((label, i) => (
            <label key={label} className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[rgb(var(--brand))]"
                checked={checked[i]}
                onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Inspector notes (optional)" htmlFor="qc-notes">
        <Textarea id="qc-notes" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="success" disabled={!all} loading={busy} onClick={() => onPass(note)}>
          Pass QC
        </Button>
        <Button variant="danger" onClick={onFail}>
          Raise an issue
        </Button>
      </div>
      {!all && <p className="text-xs text-ink-soft">Tick every item to enable Pass.</p>}
    </div>
  );
}

function NoteDialog({
  open,
  title,
  description,
  label,
  confirmLabel,
  danger,
  busy,
  error,
  note,
  setNote,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  error: string;
  note: string;
  setNote: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Go back
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label} htmlFor="dialog-note">
        <Textarea id="dialog-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <div className="mt-3">
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  );
}

function QcFailDialog({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const valid = title.trim() && description.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a QC issue"
      description="The job goes back to the same technician with your notes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Go back
          </Button>
          <Button variant="danger" disabled={!valid} loading={busy} onClick={() => onSubmit(title.trim(), description.trim())}>
            Fail and return to technician
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Issue title" htmlFor="qc-title" required>
          <Input id="qc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Minor oil leak at the filter" />
        </Field>
        <Field label="What did you find?" htmlFor="qc-desc" required>
          <Textarea id="qc-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  );
}

function PoDialog({
  open,
  needs,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  needs: PartNeed[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (supplier: string, items: { itemId: string; quantity: number; unitCost: number }[]) => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [rows, setRows] = useState<Record<string, { quantity: number; unitCost: number }>>({});
  const val = (n: PartNeed) => rows[n.itemId] ?? { quantity: n.shortage, unitCost: n.unitCost };
  const total = needs.reduce((s, n) => s + val(n).quantity * val(n).unitCost, 0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Create purchase order"
      description="Pre-filled with what this job is short on. Adjust quantities or costs if needed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Go back
          </Button>
          <Button
            loading={busy}
            onClick={() => onSubmit(supplier, needs.map((n) => ({ itemId: n.itemId, ...val(n) })))}
          >
            Place order · {money(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Supplier" htmlFor="po-supplier" hint="Optional">
          <Input id="po-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>
        <div className="space-y-3">
          {needs.map((n) => (
            <div key={n.itemId} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_6rem_8rem] sm:items-end">
              <div>
                <p className="font-medium">{n.name}</p>
                <p className="text-xs text-ink-soft">
                  Need {n.required}, have {n.onHand}
                </p>
              </div>
              <Field label="Order qty" htmlFor={`po-q-${n.itemId}`}>
                <Input id={`po-q-${n.itemId}`} type="number" min={1} inputMode="numeric" value={val(n).quantity} onChange={(e) => setRows({ ...rows, [n.itemId]: { ...val(n), quantity: Number(e.target.value) } })} />
              </Field>
              <Field label="Unit cost" htmlFor={`po-c-${n.itemId}`}>
                <Input id={`po-c-${n.itemId}`} type="number" min={0} inputMode="numeric" value={val(n).unitCost} onChange={(e) => setRows({ ...rows, [n.itemId]: { ...val(n), unitCost: Number(e.target.value) } })} />
              </Field>
            </div>
          ))}
        </div>
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  );
}

export function ReceiveDialog({
  open,
  orders,
  shopId,
  onClose,
  onDone,
}: {
  open: boolean;
  orders: { id: string; number: string; items: PoItem[] }[];
  shopId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rows = useMemo(
    () => orders.flatMap((o) => o.items.filter((i) => i.quantityReceived < i.quantityOrdered).map((i) => ({ order: o, item: i }))),
    [orders],
  );
  const value = (i: PoItem) => qty[i.id] ?? i.quantityOrdered - i.quantityReceived;

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      // one request per purchase order
      for (const o of orders) {
        const items = o.items
          .filter((i) => i.quantityReceived < i.quantityOrdered && value(i) > 0)
          .map((i) => ({ poItemId: i.id, quantity: value(i) }));
        if (items.length === 0) continue;
        await api(`/api/pos/${shopId}/purchase-orders/${o.id}/receive`, { method: "POST", body: { items } });
      }
      toast.push("success", "Delivery recorded. Stock updated.");
      setQty({});
      await onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Receive delivery"
      description="Enter what actually arrived. Receiving less than ordered is fine: the rest stays on order."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Go back
          </Button>
          <Button loading={busy} onClick={submit}>
            Confirm receipt
          </Button>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing is waiting to be received.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ order, item }) => (
            <div key={item.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-[1fr_7rem] sm:items-end">
              <div>
                <p className="font-medium">{item.item.name}</p>
                <p className="text-xs text-ink-soft">
                  <span className="font-mono">{order.number}</span> · ordered {item.quantityOrdered}, received {item.quantityReceived}
                </p>
              </div>
              <Field label="Received now" htmlFor={`rc-${item.id}`}>
                <Input
                  id={`rc-${item.id}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={item.quantityOrdered - item.quantityReceived}
                  value={value(item)}
                  onChange={(e) => setQty({ ...qty, [item.id]: Number(e.target.value) })}
                />
              </Field>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <InlineError>{err}</InlineError>
      </div>
    </Modal>
  );
}
