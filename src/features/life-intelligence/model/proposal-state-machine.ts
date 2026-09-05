import type { LifeEventProposalStatus } from "./types";

const transitions: Readonly<Record<LifeEventProposalStatus, readonly LifeEventProposalStatus[]>> = {
  pending: ["accepted", "corrected", "rejected", "superseded"],
  accepted: [],
  corrected: [],
  rejected: [],
  superseded: [],
};

export class InvalidProposalTransitionError extends Error {
  constructor(from: LifeEventProposalStatus, to: LifeEventProposalStatus) {
    super(`LifeEvent proposal cannot transition from ${from} to ${to}.`);
    this.name = "InvalidProposalTransitionError";
  }
}

/** Repeating the same terminal transition is an idempotent retry. */
export function assertProposalTransition(
  from: LifeEventProposalStatus,
  to: LifeEventProposalStatus,
): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) throw new InvalidProposalTransitionError(from, to);
}
