"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { Task } from "@/lib/types";
import {
  STATUS_META,
  PRIORITY_LABEL,
  STATUSES,
  ISSUE_PREFIX,
} from "@/lib/constants";
import { useBoard } from "./board-context";
import { CategoryChip, PriorityBadge, LifeBadge, DueLabel } from "./ui";

type SortKey = "title" | "status" | "priority" | "due";

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i]));

export default function ListView() {
  const { visibleTasks, categoryById, lifeAreaByName, seqById, openTask } =
    useBoard();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "status",
    dir: 1,
  });

  const rows = useMemo(() => {
    const arr = [...visibleTasks];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
            a.position - b.position;
          break;
        case "priority":
          cmp = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
          break;
        case "due":
          cmp =
            (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
          break;
      }
      return cmp * sort.dir;
    });
    return arr;
  }, [visibleTasks, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );
  }

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th>
      <button
        onClick={() => toggleSort(k)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: 0,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
        <ArrowUpDown size={12} opacity={sort.key === k ? 1 : 0.35} />
      </button>
    </th>
  );

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>No tasks match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table className="list-table">
        <thead>
          <tr>
            <Th k="title" label="Task" />
            <Th k="status" label="Status" />
            <Th k="priority" label="Priority" />
            <Th k="due" label="Due" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t: Task) => {
            const meta = STATUS_META[t.status];
            const cats = t.categoryIds
              .map((id) => categoryById.get(id))
              .filter((c) => c);
            return (
              <tr
                key={t.id}
                className="list-row"
                onClick={() => openTask(t)}
                title={PRIORITY_LABEL[t.priority]}
              >
                <td>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="task-key">
                      {ISSUE_PREFIX}-{seqById.get(t.id) ?? t.id}
                    </span>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    <LifeBadge
                      name={t.life_area}
                      color={lifeAreaByName.get(t.life_area)?.color}
                    />
                    {cats.map((c) => c && <CategoryChip key={c.id} category={c} />)}
                  </div>
                </td>
                <td>
                  <span
                    className="status-pill"
                    style={{
                      ["--col-accent" as string]: `var(${meta.accentVar})`,
                    }}
                  >
                    <span className="column-dot" style={{ width: 7, height: 7 }} />
                    {meta.label}
                  </span>
                </td>
                <td>
                  <PriorityBadge priority={t.priority} />
                </td>
                <td>
                  {t.status === "onhold" && t.revisit_date ? (
                    <DueLabel date={t.revisit_date} isDone={false} isRevisit />
                  ) : t.due_date ? (
                    <DueLabel date={t.due_date} isDone={t.status === "done"} />
                  ) : (
                    <span style={{ color: "var(--text-subtle)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
