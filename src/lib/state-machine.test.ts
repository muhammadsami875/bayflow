import { describe, expect, it } from "vitest";
import {
  ACTION_RULES,
  BOOKING_ACTIONS,
  BOOKING_STATUSES,
  availableActions,
  checkTransition,
  type ActorRole,
} from "./state-machine";

describe("booking state machine", () => {
  it("allows the happy-path transitions for the right role", () => {
    expect(checkTransition("CONFIRM", "PENDING", "SERVICE_ADVISOR")).toEqual({ ok: true, to: "CONFIRMED" });
    expect(checkTransition("SUBMIT_ESTIMATE", "INSPECTING", "TECHNICIAN")).toEqual({
      ok: true,
      to: "ESTIMATE_REVIEW",
    });
    expect(checkTransition("APPROVE_ESTIMATE", "AWAITING_CUSTOMER", "CUSTOMER")).toEqual({
      ok: true,
      to: "ESTIMATE_APPROVED",
    });
    expect(checkTransition("QC_FAIL", "QC_IN_PROGRESS", "QC_INSPECTOR")).toEqual({ ok: true, to: "IN_REPAIR" });
  });

  it("rejects an action from the wrong status", () => {
    expect(checkTransition("CONFIRM", "ASSIGNED", "SERVICE_ADVISOR")).toEqual({ ok: false, reason: "STATE" });
    expect(checkTransition("ALLOCATE_PARTS", "PARTS_PENDING", "PARTS_PERSON")).toEqual({
      ok: false,
      reason: "STATE",
    });
  });

  it("rejects an action by the wrong role", () => {
    expect(checkTransition("CONFIRM", "PENDING", "TECHNICIAN")).toEqual({ ok: false, reason: "ROLE" });
    expect(checkTransition("PICK_QC", "QC_PENDING", "SERVICE_ADVISOR")).toEqual({ ok: false, reason: "ROLE" });
    expect(checkTransition("APPROVE_ESTIMATE", "AWAITING_CUSTOMER", "SERVICE_ADVISOR")).toEqual({
      ok: false,
      reason: "ROLE",
    });
  });

  it("lets the owner do service advisor actions but nobody else's", () => {
    expect(checkTransition("CONFIRM", "PENDING", "OWNER").ok).toBe(true);
    expect(checkTransition("PICK_QC", "QC_PENDING", "OWNER").ok).toBe(false);
    expect(checkTransition("SUBMIT_ESTIMATE", "INSPECTING", "OWNER").ok).toBe(false);
  });

  it("allows cancellation only before repair starts", () => {
    for (const s of ["PENDING", "CONFIRMED", "AWAITING_CUSTOMER", "PARTS_READY"] as const) {
      expect(checkTransition("CANCEL", s, "CUSTOMER").ok).toBe(true);
    }
    for (const s of ["IN_REPAIR", "QC_PENDING", "READY_FOR_PICKUP", "COMPLETED", "CANCELLED"] as const) {
      expect(checkTransition("CANCEL", s, "SERVICE_ADVISOR").ok).toBe(false);
    }
  });

  it("never leaves a terminal status", () => {
    const roles: ActorRole[] = ["CUSTOMER", "OWNER", "SERVICE_ADVISOR", "TECHNICIAN", "QC_INSPECTOR", "PARTS_PERSON"];
    for (const s of ["COMPLETED", "CANCELLED"] as const) {
      for (const r of roles) expect(availableActions(s, r)).toEqual([]);
    }
  });

  it("only references real statuses and defines a rule for every action", () => {
    for (const a of BOOKING_ACTIONS) {
      const rule = ACTION_RULES[a];
      expect(rule).toBeDefined();
      rule.from.forEach((s) => expect(BOOKING_STATUSES).toContain(s));
      if (rule.to) expect(BOOKING_STATUSES).toContain(rule.to);
    }
  });

  it("gives the QC fail loop and rejection path a way back", () => {
    expect(ACTION_RULES.QC_FAIL.to).toBe("IN_REPAIR");
    expect(ACTION_RULES.REQUEST_REVISION.from).toContain("ESTIMATE_REJECTED");
    expect(ACTION_RULES.REQUEST_REVISION.to).toBe("INSPECTING");
  });
});
