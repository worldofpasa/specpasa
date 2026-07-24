import { describe, expect, it } from "vitest";
import {
  assertStatusTransition,
  canAdvancePhase,
  canTransitionStatus,
  forkInitialState,
  nextPhase,
} from "../src/lifecycle.js";

describe("status transitions", () => {
  it("allows draft -> in_review -> frozen", () => {
    expect(canTransitionStatus("draft", "in_review")).toBe(true);
    expect(canTransitionStatus("in_review", "frozen")).toBe(true);
  });

  it("allows sending in_review back to draft", () => {
    expect(canTransitionStatus("in_review", "draft")).toBe(true);
  });

  it("never thaws a frozen spec", () => {
    expect(canTransitionStatus("frozen", "draft")).toBe(false);
    expect(canTransitionStatus("frozen", "in_review")).toBe(false);
    expect(() => assertStatusTransition("frozen", "draft")).toThrow();
  });

  it("rejects skipping review", () => {
    expect(canTransitionStatus("draft", "frozen")).toBe(false);
  });
});

describe("phase progression", () => {
  it("moves draft -> prd -> erd -> tasks -> end", () => {
    expect(nextPhase("draft")).toBe("prd");
    expect(nextPhase("prd")).toBe("erd");
    expect(nextPhase("erd")).toBe("tasks");
    expect(nextPhase("tasks")).toBeNull();
  });

  it("gates phase advancement on frozen status", () => {
    expect(canAdvancePhase({ phase: "draft", status: "frozen" })).toBe(true);
    expect(canAdvancePhase({ phase: "draft", status: "draft" })).toBe(false);
    expect(canAdvancePhase({ phase: "prd", status: "frozen" })).toBe(true);
    expect(canAdvancePhase({ phase: "prd", status: "in_review" })).toBe(false);
    expect(canAdvancePhase({ phase: "tasks", status: "frozen" })).toBe(false);
  });
});

describe("fork semantics", () => {
  it("forks into a draft of the same phase", () => {
    expect(forkInitialState("erd")).toEqual({ phase: "erd", status: "draft" });
    expect(forkInitialState("draft")).toEqual({ phase: "draft", status: "draft" });
  });
});
