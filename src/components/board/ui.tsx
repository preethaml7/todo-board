"use client";

import type { Category } from "@/lib/types";
import type { Priority } from "@/lib/constants";
import { ISSUE_PREFIX, PRIORITY_LABEL } from "@/lib/constants";
import { dueState, formatDue } from "@/lib/date";
import { CalendarClock, ChevronDown, ChevronsUp, Equal } from "lucide-react";

export function CategoryChip({ category }: { category: Category }) {
  return (
    <span className={`chip chip-${category.color}`}>
      <span className="chip-dot" style={{ background: "currentColor" }} />
      {category.name}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge-priority badge-${priority}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Jira/Linear-style compact priority icon. */
export function PriorityIcon({ priority }: { priority: Priority }) {
  const icon =
    priority === "high" ? (
      <ChevronsUp size={15} />
    ) : priority === "medium" ? (
      <Equal size={14} />
    ) : (
      <ChevronDown size={15} />
    );
  return (
    <span
      className={`pri-icon pri-icon-${priority}`}
      title={`${PRIORITY_LABEL[priority]} priority`}
      aria-label={`${PRIORITY_LABEL[priority]} priority`}
    >
      {icon}
    </span>
  );
}

/** Muted issue key with a contiguous serial number, e.g. TASK-12. */
export function TaskKey({ seq }: { seq: number }) {
  return (
    <span className="task-key">
      {ISSUE_PREFIX}-{seq}
    </span>
  );
}

/**
 * A task's life-area badge. `color` is the chip-color key for the matching
 * life area; falls back to a neutral slate chip for unknown/legacy values.
 */
export function LifeBadge({ name, color }: { name: string; color?: string }) {
  return <span className={`life-dot chip-${color ?? "slate"}`}>{name}</span>;
}

export function DueLabel({
  date,
  isDone,
  isRevisit = false,
}: {
  date: string | null;
  isDone: boolean;
  isRevisit?: boolean;
}) {
  if (!date) return null;
  const state = isRevisit ? "normal" : dueState(date, isDone);
  const cls =
    state === "overdue"
      ? "due-overdue"
      : state === "today" || state === "soon"
        ? "due-soon"
        : "due-normal";
  return (
    <span className={`task-meta ${cls}`}>
      <CalendarClock size={13} />
      {isRevisit ? "Revisit " : ""}
      {formatDue(date)}
    </span>
  );
}
