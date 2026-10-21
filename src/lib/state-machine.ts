/**
 * Booking state machine: the single source of truth for statuses, who owns each
 * step and which actions are allowed. Pure data + pure functions so it can be
 * shared by the API (enforcement) and the UI (which buttons to show), and unit tested.
 */

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
  "INSPECTING",
  "ESTIMATE_REVIEW",
  "AWAITING_CUSTOMER",
  "ESTIMATE_APPROVED",
  "ESTIMATE_REJECTED",
  "PARTS_PENDING",
  "PARTS_ORDERED",
  "PARTS_READY",
  "IN_REPAIR",
  "QC_PENDING",
  "QC_IN_PROGRESS",
  "READY_FOR_PICKUP",
  "COMPLETED",
  "CANCELLED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type ActorRole =
  | "CUSTOMER"
  | "OWNER"
  | "SERVICE_ADVISOR"
  | "TECHNICIAN"
  | "QC_INSPECTOR"
  | "PARTS_PERSON";

export const BOOKING_ACTIONS = [
  "CONFIRM",
  "DECLINE",
  "ASSIGN_TECHNICIAN",
  "START_INSPECTION",
  "SAVE_ESTIMATE",
  "SUBMIT_ESTIMATE",
  "EDIT_ESTIMATE",
  "SEND_ESTIMATE",
  "APPROVE_ESTIMATE",
  "REJECT_ESTIMATE",
  "REQUEST_REVISION",
  "ASSIGN_PARTS_PERSON",
  "ORDER_PARTS",
  "MARK_PARTS_READY",
  "ALLOCATE_PARTS",
  "SEND_TO_QC",
  "PICK_QC",
  "QC_PASS",
  "QC_FAIL",
  "NOTIFY_READY",
  "COMPLETE",
  "CANCEL",
] as const;
export type BookingAction = (typeof BOOKING_ACTIONS)[number];

interface ActionRule {
  from: readonly BookingStatus[];
  /** `null` = the action changes data but not the status. */
  to: BookingStatus | null;
  /** Roles allowed. OWNER is implicitly allowed wherever SERVICE_ADVISOR is. */
  roles: readonly ActorRole[];
}

export const CANCELLABLE: readonly BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "ASSIGNED",
  "INSPECTING",
  "ESTIMATE_REVIEW",
  "AWAITING_CUSTOMER",
  "ESTIMATE_APPROVED",
  "ESTIMATE_REJECTED",
  "PARTS_PENDING",
  "PARTS_ORDERED",
  "PARTS_READY",
];

export const ACTION_RULES: Record<BookingAction, ActionRule> = {
  CONFIRM: { from: ["PENDING"], to: "CONFIRMED", roles: ["SERVICE_ADVISOR"] },
  DECLINE: { from: ["PENDING"], to: "CANCELLED", roles: ["SERVICE_ADVISOR"] },
  ASSIGN_TECHNICIAN: { from: ["CONFIRMED"], to: "ASSIGNED", roles: ["SERVICE_ADVISOR"] },
  START_INSPECTION: { from: ["ASSIGNED"], to: "INSPECTING", roles: ["TECHNICIAN"] },
  SAVE_ESTIMATE: { from: ["INSPECTING"], to: null, roles: ["TECHNICIAN"] },
  SUBMIT_ESTIMATE: { from: ["INSPECTING"], to: "ESTIMATE_REVIEW", roles: ["TECHNICIAN"] },
  EDIT_ESTIMATE: { from: ["ESTIMATE_REVIEW"], to: null, roles: ["SERVICE_ADVISOR"] },
  SEND_ESTIMATE: { from: ["ESTIMATE_REVIEW"], to: "AWAITING_CUSTOMER", roles: ["SERVICE_ADVISOR"] },
  APPROVE_ESTIMATE: { from: ["AWAITING_CUSTOMER"], to: "ESTIMATE_APPROVED", roles: ["CUSTOMER"] },
  REJECT_ESTIMATE: { from: ["AWAITING_CUSTOMER"], to: "ESTIMATE_REJECTED", roles: ["CUSTOMER"] },
  REQUEST_REVISION: { from: ["ESTIMATE_REJECTED"], to: "INSPECTING", roles: ["SERVICE_ADVISOR"] },
  ASSIGN_PARTS_PERSON: { from: ["ESTIMATE_APPROVED"], to: "PARTS_PENDING", roles: ["SERVICE_ADVISOR"] },
  ORDER_PARTS: { from: ["PARTS_PENDING"], to: "PARTS_ORDERED", roles: ["PARTS_PERSON"] },
  MARK_PARTS_READY: { from: ["PARTS_PENDING"], to: "PARTS_READY", roles: ["PARTS_PERSON"] },
  ALLOCATE_PARTS: { from: ["PARTS_READY"], to: "IN_REPAIR", roles: ["PARTS_PERSON"] },
  SEND_TO_QC: { from: ["IN_REPAIR"], to: "QC_PENDING", roles: ["TECHNICIAN"] },
  PICK_QC: { from: ["QC_PENDING"], to: "QC_IN_PROGRESS", roles: ["QC_INSPECTOR"] },
  QC_PASS: { from: ["QC_IN_PROGRESS"], to: "READY_FOR_PICKUP", roles: ["QC_INSPECTOR"] },
  QC_FAIL: { from: ["QC_IN_PROGRESS"], to: "IN_REPAIR", roles: ["QC_INSPECTOR"] },
  NOTIFY_READY: { from: ["READY_FOR_PICKUP"], to: null, roles: ["SERVICE_ADVISOR"] },
  COMPLETE: { from: ["READY_FOR_PICKUP"], to: "COMPLETED", roles: ["SERVICE_ADVISOR", "CUSTOMER"] },
  CANCEL: { from: CANCELLABLE, to: "CANCELLED", roles: ["SERVICE_ADVISOR", "CUSTOMER"] },
};

/** The OWNER may perform every Service Advisor action in their own shops. */
export function roleMatches(actor: ActorRole, allowed: readonly ActorRole[]): boolean {
  if (allowed.includes(actor)) return true;
  return actor === "OWNER" && allowed.includes("SERVICE_ADVISOR");
}

export type TransitionCheck =
  | { ok: true; to: BookingStatus | null }
  | { ok: false; reason: "ROLE" | "STATE" };

export function checkTransition(
  action: BookingAction,
  status: BookingStatus,
  actor: ActorRole,
): TransitionCheck {
  const rule = ACTION_RULES[action];
  if (!roleMatches(actor, rule.roles)) return { ok: false, reason: "ROLE" };
  if (!rule.from.includes(status)) return { ok: false, reason: "STATE" };
  return { ok: true, to: rule.to };
}

/** Actions a given role could take on a booking in this status (ignores assignment checks). */
export function availableActions(status: BookingStatus, actor: ActorRole): BookingAction[] {
  return BOOKING_ACTIONS.filter((a) => checkTransition(a, status, actor).ok);
}

export const TERMINAL_STATUSES: readonly BookingStatus[] = ["COMPLETED", "CANCELLED"];

/** The happy-path order, used for the customer-facing progress timeline. */
export const TIMELINE_STEPS: { key: string; label: string; statuses: BookingStatus[] }[] = [
  { key: "booked", label: "Booked", statuses: ["PENDING"] },
  { key: "confirmed", label: "Confirmed", statuses: ["CONFIRMED", "ASSIGNED"] },
  { key: "inspection", label: "Inspection", statuses: ["INSPECTING", "ESTIMATE_REVIEW"] },
  {
    key: "estimate",
    label: "Estimate",
    statuses: ["AWAITING_CUSTOMER", "ESTIMATE_REJECTED", "ESTIMATE_APPROVED"],
  },
  { key: "parts", label: "Parts", statuses: ["PARTS_PENDING", "PARTS_ORDERED", "PARTS_READY"] },
  { key: "repair", label: "Repair", statuses: ["IN_REPAIR"] },
  { key: "qc", label: "Quality check", statuses: ["QC_PENDING", "QC_IN_PROGRESS"] },
  { key: "ready", label: "Ready", statuses: ["READY_FOR_PICKUP"] },
  { key: "done", label: "Completed", statuses: ["COMPLETED"] },
];

export function timelineIndex(status: BookingStatus): number {
  const i = TIMELINE_STEPS.findIndex((s) => s.statuses.includes(status));
  return i === -1 ? 0 : i;
}
