import { describe, expect, it } from "vitest";

import { assertProposalTransition, InvalidProposalTransitionError } from "./proposal-state-machine";

describe("LifeEvent proposal state machine", () => {
  it.each(["accepted", "corrected", "rejected", "superseded"] as const)(
    "allows pending -> %s",
    (status) => expect(() => assertProposalTransition("pending", status)).not.toThrow(),
  );

  it("treats an identical terminal transition as an idempotent retry", () => {
    expect(() => assertProposalTransition("accepted", "accepted")).not.toThrow();
    expect(() => assertProposalTransition("rejected", "rejected")).not.toThrow();
  });

  it("keeps terminal decisions terminal", () => {
    expect(() => assertProposalTransition("rejected", "accepted")).toThrow(InvalidProposalTransitionError);
    expect(() => assertProposalTransition("accepted", "corrected")).toThrow(InvalidProposalTransitionError);
    expect(() => assertProposalTransition("superseded", "pending")).toThrow(InvalidProposalTransitionError);
  });
});
