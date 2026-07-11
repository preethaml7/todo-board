"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Sun, CalendarRange, Clock, Inbox } from "lucide-react";
import type { Task } from "@/lib/types";
import { overviewBucket, type OverviewBucket } from "@/lib/date";
import { useBoard } from "./board-context";
import { PriorityBadge, LifeBadge, DueLabel, CategoryChip } from "./ui";
import type { Category } from "@/lib/types";
import { WeekStrip } from "./WeekStrip";

const BUCKETS: {
  key: OverviewBucket;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "overdue", label: "Overdue", icon: <AlertTriangle size={15} />, color: "var(--danger)" },
  { key: "today", label: "Today", icon: <Sun size={15} />, color: "var(--warn)" },
  { key: "week", label: "This week", icon: <CalendarRange size={15} />, color: "var(--accent)" },
  { key: "later", label: "Later", icon: <Clock size={15} />, color: "var(--col-deferred-accent)" },
  { key: "someday", label: "No date", icon: <Inbox size={15} />, color: "var(--text-subtle)" },
];

function MiniCard({
  task,
  categoryById,
  onOpen,
}: {
  task: Task;
  categoryById: Map<number, Category>;
  onOpen: (t: Task) => void;
}) {
  const { lifeAreaByName } = useBoard();
  const cats = task.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is Category => Boolean(c));
  return (
    <div
      className="task-card"
      style={{ marginBottom: 9, cursor: "pointer" }}
      onClick={() => onOpen(task)}
    >
      {cats.length > 0 && (
        <div className="task-cats">
          {cats.map((c) => (
            <CategoryChip key={c.id} category={c} />
          ))}
        </div>
      )}
      <div className="task-title" style={{ marginBottom: 8 }}>
        {task.title}
      </div>
      <div className="task-foot">
        <PriorityBadge priority={task.priority} />
        <LifeBadge
          name={task.life_area}
          color={lifeAreaByName.get(task.life_area)?.color}
        />
        <DueLabel date={task.due_date} isDone={false} />
      </div>
    </div>
  );
}

export default function OverviewView() {
  const { visibleTasks, categoryById, openTask } = useBoard();
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<OverviewBucket, Task[]>();
    for (const b of BUCKETS) map.set(b.key, []);
    for (const t of visibleTasks) {
      if (t.status === "done") continue; // overview = what's still ahead
      // If a day filter is active, hide tasks outside that day
      if (dayFilter && t.due_date !== dayFilter) continue;
      map.get(overviewBucket(t.due_date, false))!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
    }
    return map;
  }, [visibleTasks, dayFilter]);

  // Are there any tasks across all non-done buckets?
  const totalUpcoming = useMemo(() => {
    let n = 0;
    for (const arr of grouped.values()) n += arr.length;
    return n;
  }, [grouped]);

  if (totalUpcoming === 0) {
    return (
      <div className="empty-state empty-state-board anim-fade">
        <img
          src="/empty-overview.svg"
          alt=""
          width="180"
          height="126"
          className="empty-illustration"
        />
        <h3>All clear.</h3>
        <p>
          Nothing due today, this week, or later. Add a new task from the toolbar,
          or hit <kbd className="kbd">⌘</kbd><kbd className="kbd">⇧</kbd><kbd className="kbd">T</kbd> to quick-capture.
        </p>
      </div>
    );
  }

  return (
    <div>
      <WeekStrip
        tasks={visibleTasks.filter((t) => t.status !== "done")}
        selected={dayFilter}
        onSelect={setDayFilter}
      />
    <div className="overview-grid">
      {BUCKETS.map((b) => {
        const items = grouped.get(b.key) ?? [];
        return (
          <div className="overview-col" key={b.key}>
            <h3 style={{ color: b.color }}>
              {b.icon}
              <span style={{ color: "var(--text)" }}>{b.label}</span>
              <span className="count-badge" style={{ marginLeft: "auto" }}>
                {items.length}
              </span>
            </h3>
            {items.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-subtle)" }}>
                Nothing here.
              </p>
            ) : (
              items.map((t) => (
                <MiniCard
                  key={t.id}
                  task={t}
                  categoryById={categoryById}
                  onOpen={openTask}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
    </div>
  );
}
