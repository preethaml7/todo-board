import { getDb } from "@/db/client";

/**
 * Per-account login throttling to blunt brute-force attempts.
 *
 * After FREE_ATTEMPTS consecutive failures the account is locked for a
 * growing duration. A successful login clears the counter. Because this is a
 * single-user app, tracking is keyed on the (only) username.
 */
const FREE_ATTEMPTS = 5;
const LOCK_STEPS_MS = [
  60_000, // 1 min  (after 5 fails)
  5 * 60_000, // 5 min
  15 * 60_000, // 15 min
  60 * 60_000, // 1 hour (cap)
];

interface AttemptRow {
  username: string;
  failed_count: number;
  locked_until: string | null;
  last_attempt_at: string | null;
}

function getRow(username: string): AttemptRow | undefined {
  return getDb()
    .prepare("SELECT * FROM login_attempts WHERE username = ?")
    .get(username) as AttemptRow | undefined;
}

export interface LockState {
  locked: boolean;
  retryAfterMs: number;
}

export function checkLock(username: string): LockState {
  const row = getRow(username);
  if (!row?.locked_until) return { locked: false, retryAfterMs: 0 };
  const remaining = new Date(row.locked_until).getTime() - Date.now();
  return remaining > 0
    ? { locked: true, retryAfterMs: remaining }
    : { locked: false, retryAfterMs: 0 };
}

export function recordFailure(username: string): LockState {
  const db = getDb();
  const row = getRow(username);
  const failed = (row?.failed_count ?? 0) + 1;
  const nowIso = new Date().toISOString();

  let lockedUntil: string | null = null;
  if (failed >= FREE_ATTEMPTS) {
    const stepIndex = Math.min(
      failed - FREE_ATTEMPTS,
      LOCK_STEPS_MS.length - 1,
    );
    lockedUntil = new Date(Date.now() + LOCK_STEPS_MS[stepIndex]).toISOString();
  }

  db.prepare(
    `INSERT INTO login_attempts (username, failed_count, locked_until, last_attempt_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       failed_count = excluded.failed_count,
       locked_until = excluded.locked_until,
       last_attempt_at = excluded.last_attempt_at`,
  ).run(username, failed, lockedUntil, nowIso);

  return lockedUntil
    ? { locked: true, retryAfterMs: new Date(lockedUntil).getTime() - Date.now() }
    : { locked: false, retryAfterMs: 0 };
}

export function clearFailures(username: string) {
  getDb().prepare("DELETE FROM login_attempts WHERE username = ?").run(username);
}
