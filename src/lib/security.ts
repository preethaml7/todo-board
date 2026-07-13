import "server-only";
import { headers } from "next/headers";

/**
 * Resolve the real client IP from common proxy headers.
 * Used for throttling and logging only — never for authorization.
 * Falls back to the first `X-Forwarded-For` hop, then `X-Real-IP`.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

type Level = "info" | "warn";

/** Structured, secret-free security logging to stdout (captured by Docker). */
export function logSecurityEvent(
  event: string,
  data: Record<string, string | number | boolean> = {},
  level: Level = "info",
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope: "security",
    level,
    event,
    ...data,
  });
  if (level === "warn") console.warn(line);
  else console.log(line);
}

/* ------------------------- in-memory IP throttle ----------------------- */
// Coarse per-IP throttle for auth endpoints, complementing the per-account
// lockout in rate-limit.ts. In-memory is sufficient for a single instance;
// put a reverse proxy with rate-limiting in front if you need more.
//
// IMPORTANT: This state lives only in this process. If you ever scale
// Boardspace to multiple replicas behind a load balancer, every replica
// will keep its own counter, effectively giving each attacker N×the
// attempts. At that point, replace this with a shared store (Redis,
// the existing SQLite database, etc.) BEFORE adding a second replica.
// See docs/architecture-decisions/ for the threshold that triggered this
// note.

const WINDOW_MS = 5 * 60_000;
const MAX_HITS = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function ipThrottle(ip: string): { limited: boolean; retryAfterMs: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, retryAfterMs: 0 };
  }
  b.count++;
  if (b.count > MAX_HITS) {
    return { limited: true, retryAfterMs: b.resetAt - now };
  }
  return { limited: false, retryAfterMs: 0 };
}

// Opportunistic cleanup so the map can't grow unbounded.
export function sweepThrottle() {
  const now = Date.now();
  for (const [ip, b] of buckets) if (now > b.resetAt) buckets.delete(ip);
}
