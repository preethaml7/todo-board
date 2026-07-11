// Date helpers for due-date display and bucketing. Dates are stored as
// 'YYYY-MM-DD' strings and compared in the user's local timezone.

export type DueState = "overdue" | "today" | "soon" | "normal" | "none";

function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseLocal(dateStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days from today (negative = past). */
export function daysUntil(
  dateStr: string | null,
  now: Date = new Date(),
): number | null {
  if (!dateStr) return null;
  const d = parseLocal(dateStr);
  if (!d) return null;
  const diff = d.getTime() - startOfToday(now).getTime();
  return Math.round(diff / 86_400_000);
}

/** Hours from now (decimal). For same-day relative time. */
export function hoursUntil(
  dateStr: string | null,
  now: Date = new Date(),
): number | null {
  if (!dateStr) return null;
  const d = parseLocal(dateStr);
  if (!d) return null;
  // Use a fixed time-of-day for the target (end of day: 17:00 local)
  d.setHours(17, 0, 0, 0);
  return (d.getTime() - now.getTime()) / 3_600_000;
}

export function dueState(
  dateStr: string | null,
  isDone: boolean,
  now: Date = new Date(),
): DueState {
  if (!dateStr) return "none";
  if (isDone) return "normal";
  const days = daysUntil(dateStr, now);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 2) return "soon";
  return "normal";
}

/**
 * Time-aware due date string. Examples:
 *   "Today"          — same day
 *   "This morning"   — same day, before noon
 *   "This afternoon" — same day, noon to 6pm
 *   "Tonight"        — same day, 6pm onwards
 *   "Tomorrow"       — +1 day
 *   "Yesterday"      — -1 day
 *   "3d overdue"     — past
 *   "in 5d"          — within a week
 *   "Sep 12"         — far future (>7d)
 */
export function formatDue(dateStr: string | null, now: Date = new Date()): string {
  if (!dateStr) return "";
  const d = parseLocal(dateStr);
  if (!d) return "";
  const days = daysUntil(dateStr, now);
  const base = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days === 0) {
    // Same day — pick a relative flavor based on the time of day
    const hr = now.getHours();
    if (hr >= 18) return "Tonight";
    if (hr >= 12) return "This afternoon";
    return "This morning";
  }
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days !== null && days < 0) {
    const overdueBy = Math.abs(days);
    return overdueBy === 1 ? "1d overdue" : `${overdueBy}d overdue`;
  }
  if (days !== null && days <= 7) return `in ${days}d`;
  return base;
}

/** Time-aware with explicit "today" flag for styling. */
export function formatDueWithState(
  dateStr: string | null,
  isDone: boolean,
  now: Date = new Date(),
): { text: string; state: DueState } {
  if (!dateStr) return { text: "", state: "none" };
  return { text: formatDue(dateStr, now), state: dueState(dateStr, isDone, now) };
}

export type OverviewBucket = "overdue" | "today" | "week" | "later" | "someday";

export function overviewBucket(
  dateStr: string | null,
  isDone: boolean,
): OverviewBucket {
  if (isDone) return "later";
  const days = daysUntil(dateStr);
  if (days === null) return "someday";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

/**
 * Compact date label for cards/lists: "Today" / "Tomorrow" / "Wed" /
 * "Sep 12" depending on how far in the future.
 */
export function formatDueCompact(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = parseLocal(dateStr);
  if (!d) return "";
  const days = daysUntil(dateStr);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yest.";
  if (days !== null && days > 1 && days < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  if (days !== null && days < -1 && days > -7) {
    return `${Math.abs(days)}d ago`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Returns hour-of-day greeting: "morning" / "afternoon" / "evening" / "night" */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "evening";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}
