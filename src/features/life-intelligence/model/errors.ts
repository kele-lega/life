import type { LifeEventProposalSourceStatus } from "./types";

export class ManualLifeEventConflictError extends Error {
  constructor() {
    super("A manual LifeEvent already owns this interpretation; AI cannot overwrite it.");
    this.name = "ManualLifeEventConflictError";
  }
}

export class LifeEventProposalSourceError extends Error {
  constructor(readonly sourceStatus: Extract<LifeEventProposalSourceStatus, "stale" | "missing">) {
    super(`LifeEvent proposal source is ${sourceStatus}; accept and correct are blocked.`);
    this.name = "LifeEventProposalSourceError";
  }
}
