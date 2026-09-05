import type { LifeExtractionRequest, LifeExtractionResult } from "../model/types";

export interface LifeEventExtractor {
  readonly name: string;
  readonly version: string;
  readonly schemaVersion: number;

  extract(request: LifeExtractionRequest): Promise<LifeExtractionResult>;
}
