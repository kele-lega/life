import { existsSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

import { unexpectedNativeIncompatibleRoutes } from "./src/lib/native/incompatible-routes";

const native = process.env.LIFE_NATIVE === "1" || process.env.NEXT_PUBLIC_LIFE_NATIVE === "1";

function assertNativeTree(): void {
  const leftover = unexpectedNativeIncompatibleRoutes(process.cwd());
  if (leftover.length > 0) {
    throw new Error(
      `Native static export cannot keep ${leftover.join(", ")}. Exclude it from native:web or make it a static page.`,
    );
  }
  const api = path.join(process.cwd(), "src/app/api");
  const diaryId = path.join(process.cwd(), "src/app/diary/[id]");
  if (existsSync(api) || existsSync(diaryId)) {
    throw new Error(
      "Native static export must run through `npm run native:web`, which temporarily excludes /api and /diary/[id].",
    );
  }
}

if (native) assertNativeTree();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  ...(native
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        async headers() {
          return [{
            source: "/sw.js",
            headers: [
              { key: "Content-Type", value: "application/javascript; charset=utf-8" },
              { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
              { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
            ],
          }];
        },
      }),
};

export default nextConfig;