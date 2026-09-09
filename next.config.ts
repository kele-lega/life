import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
  // Supabase's local callback uses the loopback IP. Next.js 16 otherwise
  // blocks dev-only chunks requested from 127.0.0.1 and leaves the shell on
  // the database bootstrap placeholder.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
