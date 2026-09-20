import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  listNativeIncompatibleRoutes,
  NATIVE_EXCLUDED_TREES,
  unexpectedNativeIncompatibleRoutes,
} from "./incompatible-routes";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("native static export exclusions", () => {
  it("finds every current Route Handler and dynamic segment", () => {
    expect(listNativeIncompatibleRoutes(repoRoot)).toEqual([
      "src/app/api/cloud/[...path]",
      "src/app/api/cloud/[...path]/route.ts",
      "src/app/api/life-extraction/route.ts",
      "src/app/api/location/reverse/route.ts",
      "src/app/api/objects/[...path]",
      "src/app/api/objects/[...path]/route.ts",
      "src/app/api/replica/[...path]",
      "src/app/api/replica/[...path]/route.ts",
      "src/app/diary/[id]",
    ]);
  });

  it("has no extra server routes beyond the native:web exclusion trees", () => {
    expect(NATIVE_EXCLUDED_TREES).toEqual(["src/app/api", "src/app/diary/[id]"]);
    expect(unexpectedNativeIncompatibleRoutes(repoRoot)).toEqual([]);
  });
});