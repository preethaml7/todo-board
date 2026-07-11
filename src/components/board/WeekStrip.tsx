"use client";

/**
 * WeekStrip — a compact 7-day strip showing the next 7 days, with
 * task count dots per day. Click a day to filter the Overview view.
 *
 * Used in OverviewView header. Visual idea: like Linear's "Cycle" view,
 * a horizontal week with subtle day labels and dot density.
 */
import * as React from "react";
import { useMemo } from "react";
import styles from "./WeekStrip.module.css";
import { daysUntil, formatDueCompact } from "@/lib/date";
import type { Task } from "@/lib/types";

type Props = {
  tasks: Task[]; // visible tasks (already filtered)
  selected: string | null; // ISO date yyyy-mm-dd or null
  onSelect: (date: string | null) => void;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekStrip({ tasks, selected, onSelect }: Props) {
  // Build the next 7 days starting from today
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  // Count tasks per day
  const counts = useMemo(() => {
    const map = new Map<string, { total: number; overdue: number }>();
    for (const d of days) {
      const iso = isoOf(d);
      map.set(iso, { total: 0, overdue: 0 });
    }
    for (const t of tasks) {
      if (!t.due_date) continue;
      const entry = map.get(t.due_date);
      if (!entry) continue;
      entry.total++;
      if (t.status !== "done" && daysUntil(t.due_date)! < 0) entry.overdue++;
    }
    return map;
  }, [tasks, days]);

  const todayIso = isoOf(days[0]);

  return (
    <div className={styles.strip} role="tablist" aria-label="This week">
      <button
        type="button"
        role="tab"
        aria-selected={selected === null}
        className={`${styles.day} ${selected === null ? styles.selected : ""}`}
        onClick={() => onSelect(null)}
      >
        <span className={styles.dayLabel}>All</span>
        <span className={styles.dayCount}>{tasks.length}</span>
      </button>
      {days.map((d, i) => {
        const iso = isoOf(d);
        const c = counts.get(iso) ?? { total: 0, overdue: 0 };
        const isToday = iso === todayIso;
        const isSelected = iso === selected;
        const isPast = i === 0;
        return (
          <button
            key={iso}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`${styles.day} ${isSelected ? styles.selected : ""} ${isToday ? styles.today : ""}`}
            onClick={() => onSelect(iso)}
            title={
              c.overdue > 0
                ? `${c.overdue} overdue · ${c.total - c.overdue} more on ${formatDueCompact(iso)}`
                : `${c.total} on ${formatDueCompact(iso)}`
            }
          >
            <span className={styles.dayLabel}>
              {i === 0 ? "Today" : WEEKDAY[d.getDay()]}
            </span>
            <span className={styles.dayDate}>{d.getDate()}</span>
            <span className={styles.dots} aria-hidden>
              {Array.from({ length: Math.min(3, c.total) }).map((_, k) => (
                <span
                  key={k}
                  className={`${styles.dot} ${
                    k < c.overdue ? styles.dotOverdue : styles.dotNormal
                  }`}
                />
              ))}
              {c.total > 3 && (
                <span className={styles.dotMore}>+{c.total - 3}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}