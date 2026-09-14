import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export const NATIVE_EXCLUDED_TREES = ["src/app/api", "src/app/diary/[id]"] as const;

function posixRel(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join("/");
}

function isDynamicSegment(name: string): boolean {
  return name.startsWith("[") && name.endsWith("]");
}

function isRouteHandler(name: string): boolean {
  return /^route\.(t|j)sx?$/.test(name);
}

/** Files and dynamic folders that Next static export cannot keep. */
export function listNativeIncompatibleRoutes(repoRoot: string): string[] {
  const appDir = path.join(repoRoot, "src/app");
  const found: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      const rel = `src/app/${posixRel(appDir, full)}`;
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (isDynamicSegment(name)) found.push(rel);
        walk(full);
      } else if (isRouteHandler(name)) {
        found.push(rel);
      }
    }
  }

  walk(appDir);
  return [...new Set(found)].sort();
}

export function unexpectedNativeIncompatibleRoutes(repoRoot: string): string[] {
  return listNativeIncompatibleRoutes(repoRoot).filter((relative) => {
    return !NATIVE_EXCLUDED_TREES.some((tree) => relative === tree || relative.startsWith(`${tree}/`));
  });
}
