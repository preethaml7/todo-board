"use client";

import { useEffect, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Check,
  History,
  SlidersHorizontal,
  Paperclip,
} from "lucide-react";
import type { ActivityEntry, Category, LifeArea, Task } from "@/lib/types";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_META,
  type Priority,
  type Status,
} from "@/lib/constants";
import { getActivityAction } from "@/app/actions/board";
import ManageLifeAreas from "./ManageLifeAreas";
import NotesEditor from "./NotesEditor";
import AttachmentsSection from "./AttachmentsSection";
import { Calendar } from "@/components/Calendar";

export interface TaskDraft {
  title: string;
  life_area: string;
  status: Status;
  priority: Priority;
  owner: string | null;
  due_date: string | null;
  revisit_date: string | null;
  notes: string | null;
  categoryIds: number[];
  subtasks: { title: string; done: boolean }[];
}

function draftFrom(
  task: Task | undefined,
  defaultStatus: Status,
  defaultLifeArea: string,
): TaskDraft {
  return {
    title: task?.title ?? "",
    life_area: task?.life_area ?? defaultLifeArea,
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? "medium",
    owner: task?.owner ?? "",
    due_date: task?.due_date ?? "",
    revisit_date: task?.revisit_date ?? "",
    notes: task?.notes ?? "",
    categoryIds: task?.categoryIds ?? [],
    subtasks: task?.subtasks.map((s) => ({ title: s.title, done: s.done })) ?? [],
  };
}

const ACTIVITY_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  moved: "Moved",
  completed: "Completed",
  reopened: "Reopened",
};

export default function TaskModal({
  mode,
  task,
  defaultStatus = "todo",
  categories,
  lifeAreas,
  onClose,
  onSave,
  onDelete,
  onLifeAreasChange,
  onAttachmentCount,
}: {
  mode: "new" | "edit";
  task?: Task;
  defaultStatus?: Status;
  categories: Category[];
  lifeAreas: LifeArea[];
  onClose: () => void;
  onSave: (draft: TaskDraft, id?: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLifeAreasChange: (areas: LifeArea[]) => void;
  onAttachmentCount?: (taskId: number, count: number) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() =>
    draftFrom(task, defaultStatus, lifeAreas[0]?.name ?? "Personal"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [manageLifeOpen, setManageLifeOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode === "edit" && task) {
      getActivityAction(task.id).then((r) => {
        if (r.ok && r.data) setActivity(r.data);
      });
    }
  }, [mode, task]);

  function toggleCategory(id: number) {
    setDraft((d) => ({
      ...d,
      categoryIds: d.categoryIds.includes(id)
        ? d.categoryIds.filter((c) => c !== id)
        : [...d.categoryIds, id],
    }));
  }

  function addSubtask() {
    const t = newSubtask.trim();
    if (!t) return;
    setDraft((d) => ({
      ...d,
      subtasks: [...d.subtasks, { title: t, done: false }],
    }));
    setNewSubtask("");
  }

  async function handleSave() {
    if (!draft.title.trim()) {
      setError("Give the task a title.");
      return;
    }
    setSaving(true);
    setError("");
    const payload: TaskDraft = {
      ...draft,
      title: draft.title.trim(),
      owner: draft.owner?.trim() || null,
      due_date: draft.due_date || null,
      revisit_date: draft.status === "onhold" ? draft.revisit_date || null : null,
      notes: draft.notes?.trim() || null,
      subtasks: draft.subtasks.filter((s) => s.title.trim()),
    };
    await onSave(payload, task?.id);
    setSaving(false);
  }

  return (
    <div className="modal-overlay anim-fade" onMouseDown={onClose}>
      <div
        className="modal modal-lg anim-pop"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="modal-head">
          <h2>{mode === "edit" ? "Edit task" : "New task"}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="form-error">{error}</div>}

          <div className="form-row">
            <label htmlFor="t-title">Title</label>
            <input
              id="t-title"
              className="input"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="What needs doing?"
              autoFocus
              maxLength={300}
            />
          </div>

          <div className="form-row">
            <label>Life area</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div className="cat-select">
                {lifeAreas.map((a) => {
                  const selected = draft.life_area === a.name;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`chip chip-${a.color} cat-option ${
                        selected ? "selected" : ""
                      }`}
                      onClick={() => set("life_area", a.name)}
                    >
                      {selected && <Check size={12} />}
                      {a.name}
                    </button>
                  );
                })}
                {/* Preserve a legacy/removed value so it isn't silently lost. */}
                {draft.life_area &&
                  !lifeAreas.some((a) => a.name === draft.life_area) && (
                    <span className="chip chip-slate cat-option selected">
                      <Check size={12} />
                      {draft.life_area}
                    </span>
                  )}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setManageLifeOpen(true)}
                title="Manage life areas"
                style={{ padding: 6 }}
              >
                <SlidersHorizontal size={14} />
              </button>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="t-due">Due date</label>
            <Calendar
              id="t-due"
              value={draft.due_date || null}
              onChange={(v) => set("due_date", v ?? "")}
              placeholder="No due date"
            />
          </div>

          {draft.status === "onhold" && (
            <div className="form-row">
              <label htmlFor="t-revisit">Revisit on</label>
              <Calendar
                id="t-revisit"
                value={draft.revisit_date || null}
                onChange={(v) => set("revisit_date", v ?? "")}
                placeholder="No revisit date"
              />
            </div>
          )}

          <div className="form-row">
            <label htmlFor="t-priority">Priority</label>
            <select
              id="t-priority"
              className="select"
              value={draft.priority}
              onChange={(e) => set("priority", e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label htmlFor="t-status">Status</label>
            <select
              id="t-status"
              className="select"
              value={draft.status}
              onChange={(e) => set("status", e.target.value as Status)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Categories</label>
            <div className="cat-select">
              {categories.length === 0 && (
                <span style={{ fontSize: 13, color: "var(--text-subtle)" }}>
                  No categories yet — add some from “Manage”.
                </span>
              )}
              {categories.map((c) => {
                const selected = draft.categoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`chip chip-${c.color} cat-option ${
                      selected ? "selected" : ""
                    }`}
                    onClick={() => toggleCategory(c.id)}
                  >
                    {selected && <Check size={12} />}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-row">
            <label>Subtasks</label>
            <div>
              {draft.subtasks.map((s, i) => (
                <div className="subtask-row" key={i}>
                  <span
                    className={`subtask-check ${s.done ? "done" : ""}`}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        subtasks: d.subtasks.map((x, idx) =>
                          idx === i ? { ...x, done: !x.done } : x,
                        ),
                      }))
                    }
                    role="checkbox"
                    aria-checked={s.done}
                  >
                    {s.done && <Check size={13} />}
                  </span>
                  <input
                    className={`subtask-input ${s.done ? "done" : ""}`}
                    value={s.title}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        subtasks: d.subtasks.map((x, idx) =>
                          idx === i ? { ...x, title: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        subtasks: d.subtasks.filter((_, idx) => idx !== i),
                      }))
                    }
                    aria-label="Remove subtask"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="subtask-row">
                <button
                  type="button"
                  className="subtask-check"
                  onClick={addSubtask}
                  disabled={!newSubtask.trim()}
                  aria-label="Add subtask"
                  style={{
                    background: newSubtask.trim() ? "var(--accent)" : undefined,
                    borderColor: newSubtask.trim() ? "var(--accent)" : undefined,
                    opacity: newSubtask.trim() ? 1 : 0.5,
                  }}
                >
                  <Plus size={13} />
                </button>
                <input
                  className="subtask-input"
                  placeholder="Add a subtask and press Enter"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="form-row">
            <label>Notes</label>
            <NotesEditor
              value={draft.notes ?? ""}
              onChange={(v) => set("notes", v)}
            />
          </div>

          {mode === "edit" && task && (
            <div className="form-row">
              <label>
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Paperclip size={14} /> Files
                </span>
              </label>
              <AttachmentsSection
                taskId={task.id}
                onCountChange={(n) => onAttachmentCount?.(task.id, n)}
              />
            </div>
          )}

          {mode === "edit" && activity && activity.length > 0 && (
            <div className="form-row">
              <label>
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <History size={14} /> Activity
                </span>
              </label>
              <div className="activity-list">
                {activity.map((a) => (
                  <div className="activity-item" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <div>
                        {ACTIVITY_LABEL[a.type] ?? a.type}
                        {a.detail ? ` · ${a.detail}` : ""}
                      </div>
                      <div className="activity-time">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {mode === "edit" && task && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(task.id)}
              title="Move to Trash (recoverable)"
            >
              <Trash2 size={15} /> Delete task
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      {manageLifeOpen && (
        <ManageLifeAreas
          lifeAreas={lifeAreas}
          onClose={() => setManageLifeOpen(false)}
          onChange={onLifeAreasChange}
        />
      )}
    </div>
  );
}
