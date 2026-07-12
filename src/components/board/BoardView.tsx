"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Sparkles, Plus } from "lucide-react";
import type { Task } from "@/lib/types";
import { STATUSES, type Status } from "@/lib/constants";
import { useBoard } from "./board-context";
import { celebrate } from "./celebrate";
import Column from "./Column";
import { CardContent } from "./TaskCard";

export default function BoardView({ onSeed }: { onSeed: () => void }) {
  const {
    tasks,
    visibleTasks,
    categoryById,
    openTask,
    openNewTask,
    moveTask,
    quickAddTask,
  } = useBoard();
  const [activeId, setActiveId] = useState<number | null>(null);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Group the currently-visible tasks by status. Pinned tasks float to the top
  // of their column regardless of drag order.
  const byStatus = useMemo(() => {
    const map = new Map<Status, Task[]>();
    for (const s of STATUSES) map.set(s, []);
    for (const t of visibleTasks) map.get(t.status)?.push(t);
    for (const s of STATUSES) {
      map.get(s)!.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.position - b.position || a.id - b.id;
      });
    }
    return map;
  }, [visibleTasks]);

  // Jump to a column via number-key shortcut.
  useEffect(() => {
    function onFocusColumn(e: Event) {
      const idx = (e as CustomEvent<number>).detail;
      columnRefs.current[idx]?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
    window.addEventListener("focus-column", onFocusColumn);
    return () => window.removeEventListener("focus-column", onFocusColumn);
  }, []);

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeTaskId = Number(active.id);
    const source = tasks.find((t) => t.id === activeTaskId);
    if (!source) return;

    // Determine the destination column.
    const overId = over.id;
    let targetStatus: Status;
    if (STATUSES.includes(overId as Status)) {
      targetStatus = overId as Status;
    } else {
      const overTask = tasks.find((t) => t.id === Number(overId));
      targetStatus = overTask?.status ?? source.status;
    }

    const targetList = (byStatus.get(targetStatus) ?? []).filter(
      (t) => t.id !== activeTaskId,
    );

    // Insertion index within the target column.
    let insertAt = targetList.length;
    if (!STATUSES.includes(overId as Status)) {
      const overIdx = targetList.findIndex((t) => t.id === Number(overId));
      if (overIdx !== -1) insertAt = overIdx;
    }

    if (targetStatus === source.status) {
      const currentIdx = (byStatus.get(targetStatus) ?? []).findIndex(
        (t) => t.id === activeTaskId,
      );
      if (currentIdx === insertAt) return; // no-op
    }

    const orderedIds = [
      ...targetList.slice(0, insertAt).map((t) => t.id),
      activeTaskId,
      ...targetList.slice(insertAt).map((t) => t.id),
    ];

    moveTask(activeTaskId, targetStatus, orderedIds);
    if (targetStatus === "done" && source.status !== "done") celebrate();
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state empty-state-board anim-fade">
        <img
          src="/empty-board.svg"
          alt=""
          width="200"
          height="140"
          className="empty-illustration"
        />
        <h3>Your board is ready.</h3>
        <p>
          A kanban board built around five columns, drag-and-drop, calendar-aware
          dates, and a single password-locked account.
        </p>

        <div className="empty-state-actions">
          <button className="btn btn-primary" onClick={() => openNewTask("todo")}>
            <Plus size={16} /> Add your first task
          </button>
          <button className="btn" onClick={onSeed}>
            <Sparkles size={16} /> Load sample board
          </button>
        </div>

        <div className="empty-state-tour" aria-label="Quick tour">
          <div className="tour-step">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
            <span>Open the command palette anywhere</span>
          </div>
          <div className="tour-step">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">Enter</kbd>
            <span>Quick-add a task from the toolbar</span>
          </div>
          <div className="tour-step">
            <kbd className="kbd">1</kbd>
            <span>…</span>
            <kbd className="kbd">5</kbd>
            <span>Jump to a column</span>
          </div>
        </div>

        <details className="empty-state-details">
          <summary>What&rsquo;s in each column?</summary>
          <div className="column-tour">
            <div><span className="col-pill col-backlog">Backlog</span> ideas and someday</div>
            <div><span className="col-pill col-todo">To Do</span> committed, not started</div>
            <div><span className="col-pill col-progress">In Progress</span> active work</div>
            <div><span className="col-pill col-blocked">Blocked</span> waiting on someone</div>
            <div><span className="col-pill col-done">Done</span> shipped this week</div>
          </div>
        </details>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="columns">
        {STATUSES.map((s, i) => (
          <Column
            key={s}
            ref={(el) => {
              columnRefs.current[i] = el;
            }}
            status={s}
            tasks={byStatus.get(s) ?? []}
            categoryById={categoryById}
            onOpen={openTask}
            onQuickAdd={quickAddTask}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 220,
          easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)", // gentle overshoot
        }}
      >
        {activeTask ? (
          <div style={{ width: 260, cursor: "grabbing" }}>
            <CardContent task={activeTask} categoryById={categoryById} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
