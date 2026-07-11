"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, AlertTriangle, Sun, RotateCcw, Check } from "lucide-react";
import type { Task } from "@/lib/types";
import { getReminders } from "@/lib/reminders";
import { ISSUE_PREFIX } from "@/lib/constants";
import { useBoard } from "./board-context";
import { DueLabel } from "./ui";

const LS_ENABLED = "ptb.reminders.enabled";

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function RemindersBell() {
  const { tasks, seqById, openTask } = useBoard();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "default",
  );
  const [, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const reminders = useMemo(() => getReminders(tasks), [tasks]);

  // Init from storage + re-check every 30 min (catches passing midnight).
  useEffect(() => {
    if (typeof Notification === "undefined") setPerm("unsupported");
    else setPerm(Notification.permission);
    try {
      setEnabled(localStorage.getItem(LS_ENABLED) === "true");
    } catch {}
    const id = setInterval(() => setTick((t) => t + 1), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Fire one summary notification per day when there's something to flag.
  useEffect(() => {
    if (!enabled || perm !== "granted" || reminders.count === 0) return;
    const key = `ptb.reminders.summary.${localDay()}`;
    try {
      if (localStorage.getItem(key)) return;
      const parts: string[] = [];
      if (reminders.overdue.length) parts.push(`${reminders.overdue.length} overdue`);
      if (reminders.today.length) parts.push(`${reminders.today.length} due today`);
      if (reminders.revisit.length)
        parts.push(`${reminders.revisit.length} to revisit`);
      new Notification("My Boardspace", {
        body: parts.join(" · ") + " — open your board to review.",
        tag: key,
      });
      localStorage.setItem(key, "1");
    } catch {}
  }, [enabled, perm, reminders]);

  const toggleEnabled = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    if (enabled) {
      setEnabled(false);
      try {
        localStorage.setItem(LS_ENABLED, "false");
      } catch {}
      return;
    }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      setEnabled(true);
      try {
        localStorage.setItem(LS_ENABLED, "true");
      } catch {}
    }
  }, [enabled]);

  const openItem = (t: Task) => {
    setOpen(false);
    openTask(t);
  };

  const hasOverdue = reminders.overdue.length > 0;

  const Section = ({
    title,
    icon,
    color,
    items,
    revisit = false,
  }: {
    title: string;
    icon: React.ReactNode;
    color: string;
    items: Task[];
    revisit?: boolean;
  }) => {
    if (items.length === 0) return null;
    return (
      <div className="reminders-section">
        <div className="reminders-section-head" style={{ color }}>
          {icon} {title} <span>{items.length}</span>
        </div>
        {items.map((t) => (
          <button key={t.id} className="reminders-item" onClick={() => openItem(t)}>
            <span className="reminders-item-title">{t.title}</span>
            <span className="reminders-item-meta">
              <span className="task-key">
                {ISSUE_PREFIX}-{seqById.get(t.id) ?? t.id}
              </span>
              {revisit ? (
                <DueLabel date={t.revisit_date} isDone={false} isRevisit />
              ) : (
                <DueLabel date={t.due_date} isDone={false} />
              )}
            </span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="reminders" ref={ref}>
      <button
        className="btn btn-ghost reminders-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Reminders"
        title="Reminders"
      >
        <Bell size={16} />
        {reminders.count > 0 && (
          <span className={`reminders-badge ${hasOverdue ? "urgent" : ""}`}>
            {reminders.count}
          </span>
        )}
      </button>

      {open && (
        <div className="reminders-panel anim-pop">
          <div className="reminders-panel-head">
            <strong>Reminders</strong>
            {perm !== "unsupported" && (
              <button
                className={`reminders-toggle ${enabled ? "on" : ""}`}
                onClick={toggleEnabled}
                title={
                  perm === "denied"
                    ? "Notifications are blocked in your browser settings"
                    : "Desktop alerts (once-a-day summary)"
                }
              >
                <span className="reminders-toggle-track">
                  <span className="reminders-toggle-thumb" />
                </span>
                Desktop alerts
              </button>
            )}
          </div>

          {reminders.count === 0 ? (
            <div className="reminders-empty">
              <Check size={18} /> You&rsquo;re all caught up.
            </div>
          ) : (
            <div className="reminders-body">
              <Section
                title="Overdue"
                icon={<AlertTriangle size={13} />}
                color="var(--danger)"
                items={reminders.overdue}
              />
              <Section
                title="Due today"
                icon={<Sun size={13} />}
                color="var(--warn)"
                items={reminders.today}
              />
              <Section
                title="Ready to revisit"
                icon={<RotateCcw size={13} />}
                color="var(--col-deferred-accent)"
                items={reminders.revisit}
                revisit
              />
            </div>
          )}
          {perm === "denied" && (
            <div className="reminders-hint">
              Desktop alerts are blocked — enable notifications for this site in
              your browser to turn them on.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
