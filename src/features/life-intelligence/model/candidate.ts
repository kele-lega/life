import { normalizeInput } from "@/features/life-event/model/validation";

import type { LifeEventCandidate } from "./types";

export function normalizeLifeEventCandidate(candidate: LifeEventCandidate): LifeEventCandidate {
  const normalized = normalizeInput({
    category: candidate.category,
    name: candidate.name,
    occurredOn: candidate.occurredOn,
    timeZone: candidate.timeZone,
    timePrecision: candidate.timePrecision,
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    durationSeconds: candidate.durationSeconds,
    source: null,
    metadata: {},
  });

  return {
    category: normalized.category,
    name: normalized.name,
    occurredOn: normalized.occurredOn,
    timeZone: normalized.timeZone,
    timePrecision: normalized.timePrecision,
    startAt: normalized.startAt,
    endAt: normalized.endAt,
    durationSeconds: normalized.durationSeconds,
  };
}

export function equalLifeEventCandidates(left: LifeEventCandidate, right: LifeEventCandidate): boolean {
  return JSON.stringify(normalizeLifeEventCandidate(left)) === JSON.stringify(normalizeLifeEventCandidate(right));
}
