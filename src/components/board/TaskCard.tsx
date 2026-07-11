"use client";

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare,
  StickyNote,
  MoreHorizontal,
  Pencil,
  ArrowRight,
  Paperclip,
  Pin,
} from "lucide-react";
import type { Category, Task } from "@/lib/types";
import { STATUSES, STATUS_META } from "@/lib/constants";
import {
  CategoryChip,
  PriorityIcon,
  LifeBadge,
  DueLabel,
  TaskKey,
} from "./ui";
import { useBoard } from "./board-context";

export function CardContent({
  task,
  categoryById,
}: {
  task: Task;
  categoryById: Map<number, Category>;
}) {
  const { lifeAreaByName, seqById } = useBoard();
  const accent = `var(${STATUS_META[task.status].accentVar})`;
  const cats = task.categoryIds
    .map((id) => categoryById.get(id))
    .filter((c): c is Category => Boolean(c));
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const isDone = task.status === "done";

  return (
    <div
      className={`task-card ${isDone ? "done" : ""} ${task.pinned ? "pinned" : ""}`}
      style={{ ["--col-accent" as string]: accent }}
    >
      {task.pinned && (
        <span
          className="task-pin-badge"
          aria-label="Pinned to top"
          title="Pinned to top"
        >
          <Pin size={11} aria-hidden /> Pinned
        </span>
      )}
      {(cats.length > 0 || task.life_area) && (
        <div className="task-cats">
          <LifeBadge
            name={task.life_area}
            color={lifeAreaByName.get(task.life_area)?.color}
          />
          {cats.map((c) => (
            <CategoryChip key={c.id} category={c} />
          ))}
        </div>
      )}
      <div className="task-title">{task.title}</div>
      <div className="task-foot">
        <div className="task-foot-left">
          <PriorityIcon priority={task.priority} />
          <TaskKey seq={seqById.get(task.id) ?? task.id} />
          {task.status === "onhold" && task.revisit_date ? (
            <DueLabel date={task.revisit_date} isDone={isDone} isRevisit />
          ) : (
            <DueLabel date={task.due_date} isDone={isDone} />
          )}
          {task.subtasks.length > 0 && (
            <span className="subtask-mini">
              <CheckSquare size={13} /> {doneSubs}/{task.subtasks.length}
            </span>
          )}
          {task.notes && (
            <span className="task-meta" title="Has notes">
              <StickyNote size={13} />
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="subtask-mini" title="Attachments">
              <Paperclip size={13} /> {task.attachmentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SortableTaskCard({
  task,
  categoryById,
  onOpen,
}: {
  task: Task;
  categoryById: Map<number, Category>;
  onOpen: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { status: task.status } });
  const { moveTaskToStatus, togglePin } = useBoard();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  };

  // Stop drag/click from firing when interacting with the menu.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card-wrap ${isDragging ? "dragging" : ""} ${
        menuOpen ? "menu-open" : ""
      }`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task);
      }}
    >
      <CardContent task={task} categoryById={categoryById} />

      <button
        type="button"
        className="card-menu-btn"
        aria-label="Task actions"
        onPointerDown={stop}
        onClick={(e) => {
          stop(e);
          setMenuOpen((o) => !o);
        }}
      >
        <MoreHorizontal size={16} />
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="card-menu anim-pop"
          onPointerDown={stop}
          onClick={stop}
        >
          <button
            type="button"
            className="card-menu-item"
            onClick={() => {
              setMenuOpen(false);
              onOpen(task);
            }}
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            type="button"
            className="card-menu-item"
            onClick={() => {
              setMenuOpen(false);
              togglePin(task.id);
            }}
          >
            <Pin size={14} /> {task.pinned ? "Unpin" : "Pin to top"}
          </button>
          <div className="card-menu-divider" />
          <div className="card-menu-label">
            <ArrowRight size={12} /> Move to
          </div>
          {STATUSES.filter((s) => s !== task.status).map((s) => (
            <button
              key={s}
              type="button"
              className="card-menu-item"
              onClick={() => {
                setMenuOpen(false);
                moveTaskToStatus(task.id, s);
              }}
            >
              <span
                className="column-dot"
                style={{
                  width: 8,
                  height: 8,
                  background: `var(${STATUS_META[s].accentVar})`,
                }}
              />
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
