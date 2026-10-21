import type { ActorRole, BookingStatus } from "./state-machine";

export type Tone = "neutral" | "brand" | "accent" | "warn" | "danger";

export const STATUS_META: Record<
  BookingStatus,
  { label: string; tone: Tone; owner: string; customerHint: string }
> = {
  PENDING: { label: "Pending", tone: "warn", owner: "Service Advisor", customerHint: "Waiting for the shop to confirm your booking." },
  CONFIRMED: { label: "Confirmed", tone: "brand", owner: "Service Advisor", customerHint: "Confirmed. A technician is being assigned." },
  ASSIGNED: { label: "Assigned", tone: "brand", owner: "Technician", customerHint: "A technician is assigned and will inspect your vehicle." },
  INSPECTING: { label: "Inspecting", tone: "brand", owner: "Technician", customerHint: "Your vehicle is being inspected." },
  ESTIMATE_REVIEW: { label: "Estimate review", tone: "brand", owner: "Service Advisor", customerHint: "The shop is preparing your estimate." },
  AWAITING_CUSTOMER: { label: "Awaiting customer", tone: "warn", owner: "Customer", customerHint: "Your estimate is ready. Please review and approve it." },
  ESTIMATE_APPROVED: { label: "Estimate approved", tone: "accent", owner: "Service Advisor", customerHint: "Thanks. The shop is arranging parts." },
  ESTIMATE_REJECTED: { label: "Estimate rejected", tone: "danger", owner: "Service Advisor", customerHint: "The shop is reviewing your feedback on the estimate." },
  PARTS_PENDING: { label: "Parts pending", tone: "brand", owner: "Parts Person", customerHint: "The shop is checking parts availability." },
  PARTS_ORDERED: { label: "Parts ordered", tone: "brand", owner: "Parts Person", customerHint: "Parts have been ordered and are on the way." },
  PARTS_READY: { label: "Parts ready", tone: "accent", owner: "Parts Person", customerHint: "Parts are in. Repair starts shortly." },
  IN_REPAIR: { label: "In repair", tone: "brand", owner: "Technician", customerHint: "Your vehicle is being repaired." },
  QC_PENDING: { label: "Waiting for QC", tone: "brand", owner: "QC Inspector", customerHint: "Repair done. Waiting for the quality check." },
  QC_IN_PROGRESS: { label: "QC in progress", tone: "brand", owner: "QC Inspector", customerHint: "Quality check in progress." },
  READY_FOR_PICKUP: { label: "Ready for pickup", tone: "accent", owner: "Service Advisor", customerHint: "Your vehicle has passed inspection." },
  COMPLETED: { label: "Completed", tone: "accent", owner: "None", customerHint: "All done. Thanks for choosing us." },
  CANCELLED: { label: "Cancelled", tone: "danger", owner: "None", customerHint: "This booking was cancelled." },
};

export const ROLE_LABEL: Record<ActorRole, string> = {
  CUSTOMER: "Customer",
  OWNER: "Owner",
  SERVICE_ADVISOR: "Service Advisor",
  TECHNICIAN: "Technician",
  QC_INSPECTOR: "QC Inspector",
  PARTS_PERSON: "Parts Person",
};

export const STAFF_ROLES = ["SERVICE_ADVISOR", "TECHNICIAN", "QC_INSPECTOR", "PARTS_PERSON"] as const;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const CURRENCY = "PKR";

export function money(n: number | null | undefined): string {
  return `${CURRENCY} ${(n ?? 0).toLocaleString("en-PK")}`;
}
