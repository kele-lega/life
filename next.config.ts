import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Supabase's local callback uses the loopback IP. Next.js 16 otherwise
  // blocks dev-only chunks requested from 127.0.0.1 and leaves the shell on
  // the database bootstrap placeholder.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
