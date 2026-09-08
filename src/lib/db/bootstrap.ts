export const LIBRARY_BOOT_KEY = "life-library-bootstrap-v1";

/** A per-document name, never a mutable database proxy. The boundary verifies it before rendering. */
export function bootstrapDatabaseName(): string {
  if (typeof window === "undefined") return "life";
  try {
    const value = localStorage.getItem(LIBRARY_BOOT_KEY);
    return value && /^(life|life-(local|restore)-[a-f0-9-]{36})$/.test(value) ? value : "life";
  } catch { return "life"; }
}
