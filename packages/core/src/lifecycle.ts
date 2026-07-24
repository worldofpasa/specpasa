import { SPEC_PHASES, type SpecPhase, type SpecStatus } from "./types.js";

/**
 * Spec lifecycle rules (docs/domain-model.md "Rationale"):
 * - draft -> in_review -> frozen; in_review may go back to draft.
 * - frozen is terminal for a spec: iterate by forking, not by thawing.
 * - Freezing gates the phase transition: the next-phase spec (draft -> prd ->
 *   erd -> tasks) can only be derived from a frozen spec.
 */
const STATUS_TRANSITIONS: Record<SpecStatus, readonly SpecStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "frozen"],
  frozen: [],
};

export function canTransitionStatus(from: SpecStatus, to: SpecStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function assertStatusTransition(from: SpecStatus, to: SpecStatus): void {
  if (!canTransitionStatus(from, to)) {
    throw new Error(`Invalid spec status transition: ${from} -> ${to}`);
  }
}

export function nextPhase(phase: SpecPhase): SpecPhase | null {
  const index = SPEC_PHASES.indexOf(phase);
  return SPEC_PHASES[index + 1] ?? null;
}

/** A spec can seed the next phase only once frozen, and only if a next phase exists. */
export function canAdvancePhase(spec: { phase: SpecPhase; status: SpecStatus }): boolean {
  return spec.status === "frozen" && nextPhase(spec.phase) !== null;
}

/** Any version of any spec can be forked, including frozen ones — forking is
 * how a frozen spec is iterated on. The fork starts a new spec in draft. */
export function forkInitialState(sourcePhase: SpecPhase): {
  phase: SpecPhase;
  status: SpecStatus;
} {
  return { phase: sourcePhase, status: "draft" };
}
