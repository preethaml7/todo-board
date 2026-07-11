import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  daysUntil,
  dueState,
  formatDue,
  formatDueCompact,
  formatDueWithState,
  hoursUntil,
  overviewBucket,
  timeOfDayGreeting,
} from "./date";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("daysUntil", () => {
  it("returns 0 for today, negatives for past, positives for future", () => {
    expect(daysUntil(iso(0))).toBe(0);
    expect(daysUntil(iso(-3))).toBe(-3);
    expect(daysUntil(iso(5))).toBe(5);
  });
  it("returns null for empty/invalid", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
  });
});

describe("dueState", () => {
  it("classifies overdue / today / soon / normal", () => {
    expect(dueState(iso(-1), false)).toBe("overdue");
    expect(dueState(iso(0), false)).toBe("today");
    expect(dueState(iso(2), false)).toBe("soon");
    expect(dueState(iso(9), false)).toBe("normal");
  });
  it("done tasks are never overdue", () => {
    expect(dueState(iso(-5), true)).toBe("normal");
  });
  it("no date -> none", () => {
    expect(dueState(null, false)).toBe("none");
  });
});

describe("formatDue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to morning so 'Today' is the friendly label, not 'Tonight'
    vi.setSystemTime(new Date("2026-07-10T09:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("uses friendly relative words", () => {
    // At 09:00 (morning), today = "This morning"
    expect(formatDue(iso(0), new Date("2026-07-10T09:00:00"))).toBe("This morning");
    expect(formatDue(iso(1), new Date("2026-07-10T09:00:00"))).toBe("Tomorrow");
    expect(formatDue(iso(-1), new Date("2026-07-10T09:00:00"))).toBe("Yesterday");
  });
  it("at noon → 'This afternoon'", () => {
    expect(formatDue(iso(0), new Date("2026-07-10T13:00:00"))).toBe("This afternoon");
  });
  it("at 8pm → 'Tonight'", () => {
    expect(formatDue(iso(0), new Date("2026-07-10T20:00:00"))).toBe("Tonight");
  });
  it("uses 'Nd overdue' for past dates >1d", () => {
    expect(formatDue(iso(-2))).toBe("2d overdue");
    expect(formatDue(iso(-7))).toBe("7d overdue");
  });
  it("uses 'in Nd' for future dates within 7 days", () => {
    expect(formatDue(iso(3))).toBe("in 3d");
    expect(formatDue(iso(7))).toBe("in 7d");
  });
  it("falls back to absolute date beyond 7 days", () => {
    const result = formatDue(iso(30));
    expect(result).toMatch(/^[A-Z][a-z]{2} \d+$/);
  });
  it("flavors today's label by time of day", () => {
    vi.setSystemTime(new Date("2026-07-10T20:00:00"));
    expect(formatDue(iso(0))).toMatch(/Tonight|evening|Today/i);
  });
});

describe("formatDueCompact", () => {
  it("uses today/tomorrow/yesterday for nearby dates", () => {
    expect(formatDueCompact(iso(0))).toBe("Today");
    expect(formatDueCompact(iso(1))).toBe("Tomorrow");
    expect(formatDueCompact(iso(-1))).toBe("Yest.");
  });
  it("uses weekday for the next 2-6 days", () => {
    const result = formatDueCompact(iso(3));
    expect(result).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
  });
  it("uses 'Nd ago' for past within 7 days", () => {
    expect(formatDueCompact(iso(-3))).toBe("3d ago");
  });
});

describe("formatDueWithState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T09:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("returns both text and state", () => {
    const today = formatDueWithState(iso(0), false, new Date("2026-07-10T09:00:00"));
    expect(today.text).toBe("This morning");
    expect(today.state).toBe("today");
    const overdue = formatDueWithState(iso(-3), false, new Date("2026-07-10T09:00:00"));
    expect(overdue.state).toBe("overdue");
  });
});

describe("hoursUntil", () => {
  it("returns hours from now for a given date", () => {
    const hours = hoursUntil(iso(0));
    expect(hours).not.toBeNull();
    expect(typeof hours).toBe("number");
  });
  it("returns null for invalid dates", () => {
    expect(hoursUntil(null)).toBeNull();
  });
});

describe("timeOfDayGreeting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it.each([
    [3, "evening"],
    [7, "morning"],
    [13, "afternoon"],
    [19, "evening"],
    [23, "night"],
  ])("hour %i → '%s'", (hour: number, expected: string) => {
    vi.setSystemTime(new Date(`2026-07-10T${String(hour).padStart(2, "0")}:00:00`));
    expect(timeOfDayGreeting()).toBe(expected);
  });
});

describe("overviewBucket", () => {
  it("buckets by due date", () => {
    expect(overviewBucket(iso(-1), false)).toBe("overdue");
    expect(overviewBucket(iso(0), false)).toBe("today");
    expect(overviewBucket(iso(4), false)).toBe("week");
    expect(overviewBucket(iso(30), false)).toBe("later");
    expect(overviewBucket(null, false)).toBe("someday");
  });
});
