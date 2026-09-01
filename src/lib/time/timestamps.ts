export function nowTimestamp(): string {
  return new Date().toISOString();
}

export function assertTimestamp(value: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error("Timestamp must be a valid ISO 8601 value.");
  }
}
