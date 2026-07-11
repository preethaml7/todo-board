"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, AlertTriangle } from "lucide-react";
import type { Category, Task } from "@/lib/types";
import { STATUS_META, WIP_LIMIT, type Status } from "@/lib/constants";
import { parseQuickAdd, type ParsedQuickAdd } from "@/lib/nlp";
import SortableTaskCard from "./TaskCard";
import { useBoard } from "./board-context";
import { CategoryChip, PriorityIcon, LifeBadge, DueLabel } from "./ui";

const Column = forwardRef<
  HTMLDivElement,
  {
    status: Status;
    tasks: Task[];
    categoryById: Map<number, Category>;
    onOpen: (t: Task) => void;
    onQuickAdd: (status: Status, parsed: ParsedQuickAdd) => void;
  }
>(function Column({ status, tasks, categoryById, onOpen, onQuickAdd }, ref) {
  const meta = STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const overWip = status === "in_progress" && tasks.length > WIP_LIMIT;
  const { categories, lifeAreas, lifeAreaByName } = useBoard();

  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(
    () => parseQuickAdd(text, { categories, lifeAreas }),
    [text, categories, lifeAreas],
  );
  const hasParsedMeta =
    parsed.priority !== null ||
    parsed.due_date !== null ||
    parsed.life_area !== null ||
    parsed.categoryIds.length > 0;

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function submit() {
    if (parsed.title.trim()) {
      onQuickAdd(status, parsed);
      setText(""); // keep composer open for rapid entry (Trello-style)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div
      ref={ref}
      className={`column ${isOver ? "drag-over" : ""}`}
      style={{
        ["--col-tint" as string]: `var(${meta.tintVar})`,
        ["--col-accent" as string]: `var(${meta.accentVar})`,
      }}
    >
      <div className="column-head">
        <span className="column-dot" />
        <span className="column-title">{meta.label}</span>
        <span className={`column-count ${overWip ? "wip-warn" : ""}`}>
          {overWip && <AlertTriangle size={11} style={{ marginRight: 3 }} />}
          {tasks.length}
        </span>
      </div>

      <div ref={setNodeRef} className="column-cards">
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <SortableTaskCard
              key={t.id}
              task={t}
              categoryById={categoryById}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="empty-column" aria-hidden>
            <svg className="empty-column-illustration" viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="20" width="160" height="100" rx="10" fill="currentColor" opacity="0.06" stroke="currentColor" strokeOpacity="0.18" strokeDasharray="6 4" />
              <rect x="34" y="50" width="132" height="22" rx="6" fill="currentColor" opacity="0.05" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />
              <rect x="34" y="80" width="132" height="22" rx="6" fill="currentColor" opacity="0.05" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 3" />
            </svg>
            <p className="empty-column-hint">
              {status === "backlog" && "Drag ideas here when they're not ready yet."}
              {status === "todo" && "Drag tasks here when you're committed to doing them."}
              {status === "in_progress" && "Drag tasks here when you start working on them."}
              {status === "onhold" && "On hold until a specific revisit date."}
              {status === "done" && "Shipped. Confetti when you drag something here 🎉"}
            </p>
          </div>
        )}
      </div>

      {adding ? (
        <div className="quick-add">
          <textarea
            ref={inputRef}
            className="quick-add-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs doing?  (try: !high #tag @Work tomorrow)"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setText("");
                setAdding(false);
              }
            }}
            onBlur={() => {
              if (!text.trim()) setAdding(false);
            }}
          />
          {hasParsedMeta && (
            <div className="quick-add-preview">
              {parsed.priority && <PriorityIcon priority={parsed.priority} />}
              {parsed.life_area && (
                <LifeBadge
                  name={parsed.life_area}
                  color={lifeAreaByName.get(parsed.life_area)?.color}
                />
              )}
              {parsed.categoryIds.map((id) => {
                const c = categoryById.get(id);
                return c ? <CategoryChip key={id} category={c} /> : null;
              })}
              {parsed.due_date && (
                <DueLabel date={parsed.due_date} isDone={false} />
              )}
            </div>
          )}
          <div className="quick-add-actions">
            <button
              className="btn btn-primary"
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
              disabled={!parsed.title.trim()}
            >
              Add
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setText("");
                setAdding(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="add-task-btn" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add task
        </button>
      )}
    </div>
  );
});

export default Column;
