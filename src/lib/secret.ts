import "server-only";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Resolves the session secret (the pepper for session-token hashes) with
 * zero required configuration:
 *
 *   1. If SESSION_SECRET is set in the environment, use it (must be >= 32 chars).
 *      This lets advanced users manage it explicitly.
 *   2. Otherwise, read a persisted secret from the data directory
 *      (`<data>/.session_secret`), generating one on first run.
 *
 * The persisted file lives beside the SQLite database (same trust boundary /
 * volume), is created with 0600 permissions, and stays stable across restarts
 * so sessions survive redeploys.
 */

const MIN_LEN = 32;
let cached: string | null = null;

function dataDir(): string {
  const dbPath = process.env.DB_PATH;
  return dbPath ? dirname(dbPath) : resolve(process.cwd(), "data");
}

function secretFilePath(): string {
  return process.env.SESSION_SECRET_FILE || resolve(dataDir(), ".session_secret");
}

export interface SecretResolution {
  secret: string;
  source: "env" | "file" | "generated";
}

function resolveSecret(): SecretResolution {
  const env = process.env.SESSION_SECRET;
  if (env && env.length >= MIN_LEN) {
    return { secret: env, source: "env" };
  }
  if (env && env.length > 0) {
    throw new Error(
      `SESSION_SECRET is set but too short (${env.length} chars). Use at least ${MIN_LEN} characters, or unset it to auto-generate one.`,
    );
  }

  const file = secretFilePath();
  if (existsSync(file)) {
    const value = readFileSync(file, "utf8").trim();
    if (value.length >= MIN_LEN) return { secret: value, source: "file" };
  }

  // Generate and persist a strong secret on first run.
  const generated = randomBytes(48).toString("base64url");
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, generated, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best effort on non-POSIX */
  }
  return { secret: generated, source: "generated" };
}

/** Cached session secret. Throws only if an explicit env secret is too short. */
export function getSessionSecret(): string {
  if (cached) return cached;
  const res = resolveSecret();
  cached = res.secret;
  // One-time, secret-free observability line (Node runtime only).
  console.log(
    JSON.stringify({
      scope: "startup",
      level: "info",
      event: "session_secret_ready",
      source: res.source, // "env" | "file" | "generated"
    }),
  );
  return cached;
}
