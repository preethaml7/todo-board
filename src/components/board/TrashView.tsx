"use client";

import { useEffect } from "react";
import { X, RotateCcw, Trash2, Trash } from "lucide-react";
import type { Category, LifeArea, TrashedTask } from "@/lib/types";
import { LifeBadge, CategoryChip } from "./ui";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function TrashView({
  tasks,
  categoryById,
  lifeAreaByName,
  onClose,
  onRestore,
  onPurge,
  onEmpty,
}: {
  tasks: TrashedTask[];
  categoryById: Map<number, Category>;
  lifeAreaByName: Map<string, LifeArea>;
  onClose: () => void;
  onRestore: (id: number) => void;
  onPurge: (id: number) => void;
  onEmpty: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay anim-fade" onMouseDown={onClose}>
      <div
        className="modal modal-lg anim-pop"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="modal-head">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Trash size={17} /> Trash
            {tasks.length > 0 && (
              <span className="reminders-badge" style={{ position: "static" }}>
                {tasks.length}
              </span>
            )}
          </h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ paddingBottom: 8 }}>
        {tasks.length === 0 ? (
          <div className="empty-state empty-state-board anim-fade" style={{ paddingTop: 30 }}>
            <img
              src="/empty-trash.svg"
              alt=""
              width="160"
              height="112"
              className="empty-illustration"
            />
            <h3 style={{ fontSize: 17 }}>Trash is empty.</h3>
            <p style={{ marginBottom: 0 }}>
              Tasks you delete show up here for 30 days. Then they're gone for good.
            </p>
          </div>
        ) : (
            <>
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-subtle)",
                  margin: "2px 2px 12px",
                }}
              >
                Deleted tasks are kept here until you restore them or delete them
                forever.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tasks.map((t) => {
                  const cats = t.categoryIds
                    .map((id) => categoryById.get(id))
                    .filter((c): c is Category => Boolean(c));
                  return (
                    <div key={t.id} className="trash-row">
                      <div className="trash-row-main">
                        <div className="trash-row-title">{t.title}</div>
                        <div className="trash-row-meta">
                          <LifeBadge
                            name={t.life_area}
                            color={lifeAreaByName.get(t.life_area)?.color}
                          />
                          {cats.map((c) => (
                            <CategoryChip key={c.id} category={c} />
                          ))}
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-subtle)",
                            }}
                          >
                            deleted {timeAgo(t.deleted_at)}
                          </span>
                        </div>
                      </div>
                      <div className="trash-row-actions">
                        <button
                          className="btn"
                          onClick={() => onRestore(t.id)}
                          title="Restore to the board"
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this task forever? This cannot be undone.",
                              )
                            )
                              onPurge(t.id);
                          }}
                          aria-label="Delete forever"
                          title="Delete forever"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {tasks.length > 0 && (
          <div className="modal-foot">
            <button
              className="btn btn-danger"
              onClick={() => {
                if (
                  window.confirm(
                    `Permanently delete all ${tasks.length} tasks in Trash? This cannot be undone.`,
                  )
                )
                  onEmpty();
              }}
            >
              <Trash size={15} /> Empty Trash
            </button>
            <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
