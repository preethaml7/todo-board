import { describe, it, expect } from "vitest";
import { getReminders } from "./reminders";
import type { Task } from "./types";

function iso(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let id = 0;
function mk(partial: Partial<Task>): Task {
  return {
    id: ++id,
    title: "t",
    life_area: "Work",
    status: "todo",
    priority: "medium",
    owner: null,
    due_date: null,
    revisit_date: null,
    notes: null,
    position: 0,
    created_at: iso(0),
    updated_at: iso(0),
    completed_at: null,
    categoryIds: [],
    subtasks: [],
    attachmentCount: 0,
    ...partial,
  };
}

describe("getReminders", () => {
  it("flags overdue and due-today active tasks", () => {
    const r = getReminders([
      mk({ due_date: iso(-2) }),
      mk({ due_date: iso(0) }),
      mk({ due_date: iso(5) }),
    ]);
    expect(r.overdue).toHaveLength(1);
    expect(r.today).toHaveLength(1);
    expect(r.count).toBe(2);
  });

  it("ignores completed tasks", () => {
    const r = getReminders([mk({ due_date: iso(-2), status: "done" })]);
    expect(r.count).toBe(0);
  });

  it("surfaces on-hold tasks whose revisit date has arrived", () => {
    const r = getReminders([
      mk({ status: "onhold", revisit_date: iso(0) }),
      mk({ status: "onhold", revisit_date: iso(10) }),
    ]);
    expect(r.revisit).toHaveLength(1);
  });

  it("on-hold tasks are not counted as overdue by their due date", () => {
    const r = getReminders([mk({ status: "onhold", due_date: iso(-3) })]);
    expect(r.overdue).toHaveLength(0);
    expect(r.count).toBe(0);
  });
});
