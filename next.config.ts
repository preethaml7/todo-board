import type { NextConfig } from "next";

// Comma-separated list of extra origins allowed to invoke Server Actions
// (CSRF protection when running behind a proxy, e.g. "https://todo.example.com").
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for a small Docker image.
  output: "standalone",

  // better-sqlite3 and argon2 are native modules — keep them external to the
  // server bundle so their .node binaries load correctly at runtime.
  serverExternalPackages: ["better-sqlite3", "argon2"],

  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,

  experimental: {
    serverActions: {
      bodySizeLimit: "2048mb", // Huge limit for massive zip imports with attachments
      ...(allowedOrigins.length > 0 ? { allowedOrigins } : {}),
    },
  },
};

export default nextConfig;
