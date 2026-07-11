import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { cookieSecure, sessionCookieName } from "./session-constants";
import { getSessionSecret } from "./secret";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30-day sliding window
const REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24; // extend at most once/day
const SESSION_ABSOLUTE_MAX_MS = 1000 * 60 * 60 * 24 * 90; // hard 90-day cap

/** Hash a raw token with the server secret (pepper) before storing/looking up. */
function hashToken(token: string): string {
  return createHash("sha256")
    .update(`${token}.${getSessionSecret()}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** Create a new session row and return the raw token to put in the cookie. */
export function createSession(userId: number): {
  token: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + SESSION_TTL_MS);
  const iso = new Date(nowMs).toISOString();
  getDb()
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(tokenHash, userId, iso, expiresAt.toISOString(), iso);
  return { token, expiresAt };
}

interface SessionRow {
  token_hash: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}

/**
 * Validate the session cookie. Returns the userId if valid, else null.
 * Applies a sliding expiry and cleans expired rows opportunistically.
 */
export function validateSessionToken(token: string): number | null {
  if (!token) return null;
  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ?")
    .get(tokenHash) as SessionRow | undefined;
  if (!row) return null;

  // Constant-time confirm (defence in depth against timing on the index).
  if (!safeEqualHex(row.token_hash, tokenHash)) return null;

  const nowMs = Date.now();
  const createdMs = new Date(row.created_at).getTime();

  // Reject if past the sliding expiry OR the absolute maximum lifetime.
  if (
    new Date(row.expires_at).getTime() < nowMs ||
    nowMs - createdMs > SESSION_ABSOLUTE_MAX_MS
  ) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }

  // Sliding refresh, throttled to once per day to limit writes. Never extend
  // beyond the absolute cap.
  if (nowMs - new Date(row.last_used_at).getTime() > REFRESH_THRESHOLD_MS) {
    const slid = nowMs + SESSION_TTL_MS;
    const capped = Math.min(slid, createdMs + SESSION_ABSOLUTE_MAX_MS);
    db.prepare(
      "UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?",
    ).run(new Date(nowMs).toISOString(), new Date(capped).toISOString(), tokenHash);
  }
  return row.user_id;
}

export function destroySession(token: string) {
  if (!token) return;
  getDb()
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .run(hashToken(token));
}

export function destroyAllSessions() {
  getDb().prepare("DELETE FROM sessions").run();
}

export function purgeExpiredSessions() {
  getDb()
    .prepare("DELETE FROM sessions WHERE expires_at < ?")
    .run(new Date().toISOString());
}

/* ----------------------- cookie helpers (server) ----------------------- */

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string> {
  const store = await cookies();
  return store.get(sessionCookieName())?.value ?? "";
}
