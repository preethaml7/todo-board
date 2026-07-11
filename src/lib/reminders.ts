import type { Task } from "./types";
import { daysUntil } from "./date";

export interface Reminders {
  overdue: Task[];
  today: Task[];
  revisit: Task[];
  count: number;
}

/**
 * Compute what needs attention right now:
 *  - overdue: active (not done/deferred) task past its due date
 *  - today:   active task due today
 *  - revisit: a deferred task whose revisit date has arrived
 */
export function getReminders(tasks: Task[]): Reminders {
  const overdue: Task[] = [];
  const today: Task[] = [];
  const revisit: Task[] = [];

  for (const t of tasks) {
    if (t.status === "done") continue;

    if (t.status === "onhold") {
      if (t.revisit_date) {
        const d = daysUntil(t.revisit_date);
        if (d !== null && d <= 0) revisit.push(t);
      }
      continue;
    }

    if (t.due_date) {
      const d = daysUntil(t.due_date);
      if (d === null) continue;
      if (d < 0) overdue.push(t);
      else if (d === 0) today.push(t);
    }
  }

  const byDue = (a: Task, b: Task) =>
    (a.due_date ?? "").localeCompare(b.due_date ?? "");
  overdue.sort(byDue);
  today.sort(byDue);
  revisit.sort((a, b) => (a.revisit_date ?? "").localeCompare(b.revisit_date ?? ""));

  return {
    overdue,
    today,
    revisit,
    count: overdue.length + today.length + revisit.length,
  };
}
