"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  CalendarRange,
  Moon,
  HelpCircle,
} from "lucide-react";
import type { Task } from "@/lib/types";
import { STATUS_META } from "@/lib/constants";
import { useBoard, type ViewMode } from "./board-context";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export default function CommandPalette({
  onClose,
  onNewTask,
  onOpenTask,
  onSetView,
  onToggleTheme,
  onShowHelp,
}: {
  onClose: () => void;
  onNewTask: () => void;
  onOpenTask: (t: Task) => void;
  onSetView: (v: ViewMode) => void;
  onToggleTheme: () => void;
  onShowHelp: () => void;
}) {
  const { tasks } = useBoard();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands: Item[] = useMemo(
    () => [
      { id: "new", label: "New task", icon: <Plus size={16} />, run: onNewTask },
      {
        id: "v-board",
        label: "Go to Board view",
        icon: <LayoutGrid size={16} />,
        run: () => onSetView("board"),
      },
      {
        id: "v-list",
        label: "Go to List view",
        icon: <List size={16} />,
        run: () => onSetView("list"),
      },
      {
        id: "v-overview",
        label: "Go to Overview",
        icon: <CalendarRange size={16} />,
        run: () => onSetView("overview"),
      },
      {
        id: "theme",
        label: "Toggle light / dark theme",
        icon: <Moon size={16} />,
        run: onToggleTheme,
      },
      {
        id: "help",
        label: "Keyboard shortcuts",
        icon: <HelpCircle size={16} />,
        run: onShowHelp,
      },
    ],
    [onNewTask, onSetView, onToggleTheme, onShowHelp],
  );

  const items: Item[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    const cmds = query
      ? commands.filter((c) => c.label.toLowerCase().includes(query))
      : commands;

    const taskMatches = query
      ? tasks
          .filter((t) =>
            (t.title + " " + (t.notes ?? "")).toLowerCase().includes(query),
          )
          .slice(0, 8)
          .map<Item>((t) => ({
            id: `task-${t.id}`,
            label: t.title,
            hint: STATUS_META[t.status].label,
            icon: <Search size={16} />,
            run: () => onOpenTask(t),
          }))
      : [];

    return [...cmds, ...taskMatches];
  }, [q, commands, tasks, onOpenTask]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  }

  return (
    <div className="palette-overlay anim-fade" onMouseDown={onClose}>
      <div
        className="palette anim-pop"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <div className="palette-input">
          <Search size={18} color="var(--text-subtle)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks or run a command…"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-results">
          {items.length === 0 ? (
            <div className="palette-empty">
              <img
                src="/empty-search.svg"
                alt=""
                width="80"
                height="56"
                style={{ display: "block", margin: "12px auto 8px", opacity: 0.7 }}
              />
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                No matches
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>
                Try a different word, or press <kbd className="kbd">Esc</kbd> to close.
              </div>
            </div>
          ) : (
            items.map((it, i) => (
              <div
                key={it.id}
                className={`palette-item ${i === active ? "active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => it.run()}
              >
                <span style={{ color: "var(--text-subtle)" }}>{it.icon}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.hint && <span className="kbd">{it.hint}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
